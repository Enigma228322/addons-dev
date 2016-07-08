# -*- coding: utf-8 -*-
import openerp
from openerp import models, fields, api
from datetime import datetime, date, timedelta
from openerp.tools import DEFAULT_SERVER_DATETIME_FORMAT as DTF
import openerp.addons.decimal_precision as dp


class FleetRentalDocumentRent(models.Model):
    _name = 'fleet_rental.document_rent'

    state = fields.Selection([
        ('draft', 'Draft'),
        ('booked', 'Booked'),
        ('confirmed', 'Confirmed'),
        ('extended', 'Extended'),
        ('returned', 'Returned'),
        ('cancel', 'Cancelled'),
        ], string='Status', readonly=True, copy=False, index=True, default='draft')

    _inherits = {
                 'fleet_rental.document': 'document_id',
                 }

    document_id = fields.Many2one('fleet_rental.document', required=True,
            string='Related Document', ondelete='restrict',
            help='common part of all three types of the documents', auto_join=True)

    user_branch_id = fields.Many2one('fleet_branch.branch', default=lambda self: self.env.user.branch_id.id)

    document_return_id = fields.Many2one('fleet_rental.document_return')

    document_extend_ids = fields.One2many('fleet_rental.document_extend', 'document_rent_id')
    extends_count = fields.Integer(string='# of Extends', compute='_get_extends', readonly=True)
    account_move_ids = fields.One2many('account.move', 'fleet_rental_document_id', string='Entries', readonly=True)
    account_move_lines_ids = fields.One2many('account.move.line', 'fleet_rental_document_id', string='Entrie lines', readonly=True)
    document_extend_ids = fields.One2many('fleet_rental.document_extend', 'document_rent_id')
    balance = fields.Float(string='Balance', compute="_compute_balance", store=True, digits_compute=dp.get_precision('Product Price'), readonly=True)
    advanced_deposit = fields.Float(string='Advanced Deposit', compute="_compute_deposit", store=True, digits_compute=dp.get_precision('Product Price'), readonly=True)
    diff_datetime = fields.Datetime(string='Previous rent document return date and time')
    invoice_ids = fields.Many2many("account.invoice", string='Invoices', compute="_get_invoiced", readonly=True, copy=False)
    invoice_count = fields.Integer(string='# of Invoices', compute='_get_invoiced', readonly=True)
    invoice_line_ids = fields.One2many('account.invoice.line', 'fleet_rental_document_id', string='Invoice Lines', copy=False)
    odometer_before = fields.Float(string='Odometer', compute='_compute_odometer', store=True, readonly=True)

    @api.depends('total_rent_price', 'account_move_lines_ids', 'document_extend_ids')
    def _compute_balance(self):
        if self._model._name not in ['fleet_rental.document_rent', 'fleet_rental.document_extend']:
            return
        for record in self:
            if self._model._name == 'fleet_rental.document_rent':
                id_to_manage = record.id
            elif self._model._name == 'fleet_rental.document_extend':
                id_to_manage = record.document_rent_id.id
            account_receivable = record.partner_id.property_account_receivable_id.id
            if record.account_move_lines_ids:
                record.account_move_lines_ids[0].move_id.fleet_rental_document_id = [(4, id_to_manage)]
            mutuals_recs = self.env['account.move.line'].search([('fleet_rental_document_id', '=', id_to_manage), ('account_id', '=', account_receivable)])
            total_duty = 0
            total_paid = 0
            for r in mutuals_recs:
                total_duty += r.debit
                total_paid += r.credit
            record.balance = total_paid - total_duty

    @api.depends('total_rent_price', 'account_move_lines_ids', 'document_extend_ids')
    def _compute_deposit(self):
        if self._model._name not in ['fleet_rental.document_rent', 'fleet_rental.document_extend']:
            return
        for record in self:
            if self._model._name == 'fleet_rental.document_rent':
                id_to_manage = record.id
            elif self._model._name == 'fleet_rental.document_extend':
                id_to_manage = record.document_rent_id.id
            account_receivable = record.partner_id.property_account_receivable_id.id
            if record.account_move_lines_ids:
                record.account_move_lines_ids[0].move_id.fleet_rental_document_id = [(4, id_to_manage)]
            mutuals_recs = self.env['account.move.line'].search([('fleet_rental_document_id', '=', id_to_manage), ('account_id', '=', account_receivable)])
            total_duty = 0
            total_paid = 0
            for r in mutuals_recs:
                total_duty += r.debit
                total_paid += r.credit
            record.advanced_deposit = total_paid

    @api.onchange('vehicle_id')
    def onchange_vehicle_id(self):
        for record in self:
            record.allowed_kilometer_per_day = record.vehicle_id.allowed_kilometer_per_day
            record.rate_per_extra_km = record.vehicle_id.rate_per_extra_km
            record.daily_rental_price = record.vehicle_id.daily_rental_price

    @api.depends('vehicle_id')
    def _compute_odometer(self):
        for record in self:
            record.odometer_before = record.vehicle_id.odometer

    @api.onchange('daily_rental_price', 'vehicle_id', 'diff_datetime', 'return_datetime', 'return_datetime', 'extra_driver_charge_per_day', 'other_extra_charges')
    def all_calculations(self):
        for record in self:
            if record.exit_datetime and record.return_datetime:
                start = datetime.strptime(record.exit_datetime, DTF)
                end = datetime.strptime(record.diff_datetime or record.return_datetime, DTF)
                record.total_rental_period = (end - start).days
            record.period_rent_price = record.total_rental_period * record.daily_rental_price
            record.extra_driver_charge = record.total_rental_period * record.extra_driver_charge_per_day
            record.total_rent_price = record.period_rent_price + record.extra_driver_charge + record.other_extra_charges

    @api.depends('document_extend_ids')
    def _get_extends(self):
        for document in self:
            document.update({
                'extends_count': len(document.document_extend_ids),
            })

    @api.multi
    def action_view_invoice(self):
        invoice_ids = self.mapped('invoice_ids')
        action = self.env.ref('account.action_invoice_tree1')
        list_view_id = self.env.ref('account.invoice_tree').id
        form_view_id = self.env.ref('account.invoice_form').id

        result = {
            'name': action.name,
            'help': action.help,
            'type': action.type,
            'views': [[list_view_id, 'tree'], [form_view_id, 'form'], [False, 'graph'], [False, 'kanban'],
                      [False, 'calendar'], [False, 'pivot']],
            'target': action.target,
            'context': action.context,
            'res_model': action.res_model,
        }
        if len(invoice_ids) > 1:
            result['domain'] = "[('id','in',%s)]" % invoice_ids.ids
        elif len(invoice_ids) == 1:
            result['views'] = [(form_view_id, 'form')]
            result['res_id'] = invoice_ids.ids[0]
        else:
            result = {'type': 'ir.actions.act_window_close'}
        return result

    @api.depends('invoice_line_ids')
    def _get_invoiced(self):
        for document in self:
            invoice_ids = document.invoice_line_ids.mapped('invoice_id')
            # Search for refunds as well
            refund_ids = self.env['account.invoice'].browse()
            if invoice_ids:
                refund_ids = refund_ids.search([('type', '=', 'out_refund'), ('origin', 'in', invoice_ids.mapped('number')), ('origin', '!=', False)])

            document.update({
                'invoice_count': len(set(invoice_ids.ids + refund_ids.ids)),
                'invoice_ids': invoice_ids.ids + refund_ids.ids,
            })

    @api.multi
    def action_book(self):
        for rent in self:
            rent.state = 'booked'
            self.vehicle_id.state_id = self.env.ref('fleet.vehicle_state_booked')

    @api.multi
    def action_cancel_booking(self):
        for rent in self:
            rent.state = 'cancel'
            self.vehicle_id.state_id = self.env.ref('fleet.vehicle_state_active')

    @api.multi
    def action_confirm(self):
        for rent in self:
            rent.state = 'confirmed'

    @api.multi
    def action_create_return(self):
        document_return_obj = self.env['fleet_rental.document_return']
        for rent in self:
            rent.state = 'returned'
            self.vehicle_id.state_id = self.env.ref('fleet.vehicle_state_active')
            document_return = document_return_obj.create({
               'partner_id': rent.partner_id.id,
               'vehicle_id': rent.vehicle_id.id,
               'allowed_kilometer_per_day': rent.allowed_kilometer_per_day,
               'rate_per_extra_km': rent.rate_per_extra_km,
               'daily_rental_price': rent.daily_rental_price,
               'origin': rent.name,
               'exit_datetime': rent.exit_datetime,
               'type': 'return',
               'return_datetime': fields.Datetime.now(),
               'odometer_before': rent.odometer_before,
               })
            rent.write({'document_return_id': document_return.id})
            for r in rent.check_line_ids:
                for w in document_return.check_line_ids:
                    if r.item_id == w.item_id:
                        w.exit_check_yes = r.exit_check_yes
                        w.exit_check_no = r.exit_check_no
                        break

        return self.action_view_document_return(document_return.id)

    @api.multi
    def action_view_document_return(self, document_return_id):
        action = self.env.ref('fleet_rental_document.fleet_rental_return_document_draft_act')
        form_view_id = self.env.ref('fleet_rental_document.fleet_rental_return_document_form').id

        result = {
            'name': action.name,
            'help': action.help,
            'type': action.type,
            'views': [(form_view_id, 'form')],
            'target': action.target,
            'context': action.context,
            'res_model': action.res_model,
        }
        result['res_id'] = document_return_id
        return result

    @api.multi
    def action_view_document_extend(self, document_return_id):
        action = self.env.ref('fleet_rental_document.fleet_rental_document_extend_act')
        form_view_id = self.env.ref('fleet_rental_document.fleet_rental_document_extend_form').id

        result = {
            'name': action.name,
            'help': action.help,
            'type': action.type,
            'views': [(form_view_id, 'form')],
            'target': action.target,
            'context': action.context,
            'res_model': action.res_model,
        }
        result['res_id'] = document_return_id
        return result

    @api.model
    def create(self, vals):
        if vals.get('name', 'New') == 'New':
            vals['name'] = self.env['ir.sequence'].next_by_code('fleet_rental.document_rent') or 'New'
        result = super(FleetRentalDocumentRent, self).create(vals)
        return result


class FleetRentalDocumentExtend(models.Model):
    _name = 'fleet_rental.document_extend'
    _inherit = 'fleet_rental.document_rent'

    state = fields.Selection([
        ('draft', 'Draft'),
        ('booked', 'Booked'),
        ('confirmed', 'Confirmed'),
        ('cancel', 'Cancelled'),
        ], string='Status', readonly=True, copy=False, index=True, default='draft')

    document_rent_id = fields.Many2one('fleet_rental.document_rent')
    balance = fields.Float(related='document_rent_id.balance', readonly=True)
    advanced_deposit = fields.Float(related='document_rent_id.advanced_deposit', readonly=True)

    @api.model
    def default_get(self, fields_list):
        defaults = super(FleetRentalDocumentExtend, self).default_get(fields_list)
        context = dict(self._context or {})
        active_id = context.get('active_id')
        rent = self.env['fleet_rental.document_rent'].browse(active_id)
        defaults.setdefault('vehicle_id', rent.vehicle_id.id)
        defaults.setdefault('partner_id', rent.partner_id.id)
        defaults['exit_datetime'] = rent.exit_datetime
        defaults['diff_datetime'] = self.env['fleet_rental.document_extend'].search(
                                            [('document_rent_id', '=', rent.id)], limit=1,
                                            order='return_datetime desc').return_datetime or rent.return_datetime
        defaults['return_datetime'] = fields.Datetime.to_string(fields.Datetime.from_string(defaults['diff_datetime']) + timedelta(days=1))
        defaults.setdefault('rate_per_extra_km', rent.rate_per_extra_km)
        defaults.setdefault('extra_driver_charge_per_day', rent.extra_driver_charge_per_day)
        defaults.setdefault('odometer_before', rent.odometer_before)
        defaults.setdefault('daily_rental_price', rent.daily_rental_price)
        defaults.setdefault('allowed_kilometer_per_day', rent.allowed_kilometer_per_day)
        defaults.setdefault('partner_id', rent.partner_id)
        return defaults

    @api.multi
    def action_submit(self):
        for rent in self:
            rent.state = 'booked'
            self.vehicle_id.state_id = self.env.ref('fleet.vehicle_state_booked')

    @api.multi
    def action_view_invoice(self):
        return self.mapped('document_id').action_view_invoice()


class AccountMove(models.Model):
    _inherit = 'account.move'
    fleet_rental_document_id = fields.Many2one('fleet_rental.document_rent', readonly=True, copy=False)


class AccountMoveLine(models.Model):
    _inherit = 'account.move.line'
    fleet_rental_document_id = fields.Many2one('fleet_rental.document_rent', readonly=True, copy=False)


class AccountInvoice(models.Model):
    _inherit = 'account.invoice'

    fleet_rental_document_id = fields.Many2one('fleet_rental.document_rent', readonly=True, copy=False)

    @api.multi
    def finalize_invoice_move_lines(self, move_lines):
        res = super(AccountInvoice, self).finalize_invoice_move_lines(move_lines)
        fleet_rental_document_id = False
        for r in self.invoice_line_ids:
            if r.fleet_rental_document_id:
                fleet_rental_document_id = r.fleet_rental_document_id
                break
        if not fleet_rental_document_id:
            return res
        for move_line in move_lines:
            move_line[2]['fleet_rental_document_id'] = fleet_rental_document_id.id
        return move_lines

    @api.multi
    def register_payment(self, payment_line, writeoff_acc_id=False, writeoff_journal_id=False):
        payment_line.fleet_rental_document_id = self.fleet_rental_document_id
        res = super(AccountInvoice, self).register_payment(payment_line, writeoff_acc_id, writeoff_journal_id)


class AccountInvoiceLine(models.Model):
    _inherit = 'account.invoice.line'
    fleet_rental_document_id = fields.Many2one('fleet_rental.document_rent', readonly=True, copy=False)


class AccountPayment(models.Model):
    _inherit = 'account.payment'

    def _get_shared_move_line_vals(self, debit, credit, amount_currency, move_id, invoice_id=False):
        res = super(AccountPayment, self)._get_shared_move_line_vals(debit, credit, amount_currency, move_id, invoice_id)
        res['fleet_rental_document_id'] = self.invoice_ids[0].fleet_rental_document_id.id
        return res
