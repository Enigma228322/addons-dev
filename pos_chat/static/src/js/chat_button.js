odoo.define('pos_chat_button', function (require){
      'use_strict';

    var gui = require('point_of_sale.gui');
    var screens = require('point_of_sale.screens');
    var session = require('web.session');
    var models = require('point_of_sale.models');
    var rpc = require('web.rpc');

    var models = require('point_of_sale.models');

    var all_messages = [];
    var all_timeOuts = [];
    var chat_users = [];
    var messages_cnt = [];
    var can_change_name = true;
    var new_names = [];

    var class_array = [];

    var Disconnected = false;

    var ChatButton = screens.ActionButtonWidget.extend({
        template: 'ChatButton',
        button_click: function () {
            self = this;
            this.gui.show_screen('custom_screen');

            Disconnected = false;

            Refresh(self);
        }
    });

    function Refresh(self)
    {
        if(Disconnected) return;
        self._rpc({
            model: "pos.chat",
            method: "send_field_updates",
            args: ['', 'Connect',
             session.uid]
        });
        window.setTimeout(Refresh,1500, self)
    }

    var PosModelSuper = models.PosModel;
    models.PosModel = models.PosModel.extend({

        initialize: function () {

          PosModelSuper.prototype.initialize.apply(this, arguments);
          var self = this;

          self.bus.add_channel_callback("pos_chat_228", self.on_barcode_updates, self);
        },

        on_barcode_updates: function(data){

            var self = this;

            if(data.command == 'Connect')
            {
                if(!CheckUserExists(data.uid))
                    AddNewUser(data);
            }
            else if(data.command == 'Disconnect')
                DeleteUser(data.uid);
            else if(data.command == 'SetName')
            {
                // In this case data.uid isn't the user id, it's
                // an user number
                SetName(data.message, data.uid);
            }
            else if(data.command == 'STOP')
            {
                can_change_name = false;
                ShowUsers();
            }
            else
                AddNewMessage(data);

        },
    });

    var CustomScreenWidget = screens.ScreenWidget.extend({
        template: 'CustomScreenWidget',
        show: function () {
          var self = this;
          this._super();

            this.$('.back').off().click(function () {
                self.gui.show_screen('products');

                self._rpc({
                    model: "pos.chat",
                    method: "send_field_updates",
                    args: ['', 'Disconnect', session.uid]
                });
                Disconnected = true;
            });

            this.$('.next').off().click(function () {
                TakeNewMessage()
            });

            this.$("#text-line").off().keyup(function(event){

                if(event.keyCode == 13){
                    TakeNewMessage()
                }
            });
        }
    });

    gui.define_screen({name:'custom_screen', widget: CustomScreenWidget});

    screens.define_action_button({
        'name': 'chat_button',
        'widget': ChatButton,
    });

//----------Users relations part-----------------

    function AddNewMessage(data)
    {
        var i = NumInQueue(data.uid);

        if(all_messages[i].length >= 2)
        {
            clearTimeout(all_timeOuts[i][0]);
            Disappear(data.uid);
        }

        Push_new_message(i, data.uid, data.message);

        showMessage(data.uid);
    }

    function AddNewUser(user_data)
    {
        chat_users.push({
            name : user_data.name,
            uid : user_data.uid,
            name_changed : false
        });

        all_messages.push(new Array());
        all_timeOuts.push(new Array());
        messages_cnt.push(0);
        new_names.push('');

        ShowUsers();
    }

    function DeleteUser(user_id)
    {
        DeleteUserData(user_id);
        ShowUsers();
    }

    function SetName(new_name, num)
    {
        new_names[num] = new_name;

        if(all_names_changed())
            self._rpc({
                model: "pos.chat",
                method: "send_field_updates",
                args: ['',
                 'STOP', 0]
            });
    }

//----------Set avatar and animation part--------------
    var radius = 200;

    function ShowUsers()
    {
        var window = document.getElementById('main-window');
        var out = '';
        chat_users.forEach(function (item)
        {
            if(item.uid == session.uid)
                new_names[NumInQueue(item.uid)] == 'NaN';
            // User
            out += '<div class="chat-user-'+item.uid+'" id="picture-'+NumInQueue(item.uid)+'">';
            // User temp name
            if(!can_change_name && item.uid != session.uid)
                out += '<div class="chat-user-name">'+new_names[NumInQueue(item.uid)]+'</div>'
            // Image
            out += '<img src="/web/image/res.users/' +
            item.uid + '/image_small" id="ava-' +
            NumInQueue(item.uid)+'" class="avatar"></img>';
            // Users messages
            out += '<ul class="new-message" id="message-id-'+item.uid+'"></ul>';
            out += '</div>';
        });
        window.innerHTML = out;

        chat_users.forEach(function(item){
            var avatar = document.getElementById('ava-'+NumInQueue(item.uid)+'');
            avatar.style.setProperty('border-radius', '50%');
            SetPos(document.getElementById('picture-'+NumInQueue(item.uid)+''), item.uid);
        });
    }

    function SetPos(avatar, uid)
    {
        var cnt = NumInQueue(uid) + 1;
        var action_window = document.getElementById('main-window');
        var angle = (2 * 3.1415 / chat_users.length) * cnt;
        var w = action_window.offsetWidth;
        var h = action_window.offsetHeight;

        var x = Math.trunc(radius*Math.cos(angle));
        var y = Math.trunc(radius*Math.sin(angle));

        avatar.style.setProperty('position', 'absolute');
        avatar.style.setProperty('left', w/2 - (avatar.offsetWidth / 2) + 'px');
        avatar.style.setProperty('top', h/2 - (avatar.offsetHeight / 2) + 'px');
        avatar.style.setProperty('transform','translate3d('+x+'px,'+y+'px,0px)');
        avatar.style.setProperty('transition','transform .3s ease-in-out');
    }
//---------Message sending part---------------------
    function TakeNewMessage()
    {
        var i = NumInQueue(session.uid);

        var newMessage = document.getElementById('text-line');

        // False means to not return parsed string
        if(is_it_name(newMessage.value, false))
        {
            var num_to_send = 0;
            if(session.uid == chat_users[chat_users.length - 1].uid)
                num_to_send = 0;
            else
                num_to_send = NumInQueue(session.uid) + 1;
            if(can_change_name && chat_users.length > 1)
            {
                self._rpc({
                    model: "pos.chat",
                    method: "send_field_updates",
                    args: [is_it_name(newMessage.value, true),
                     'SetName', num_to_send]
                });
            }
            else
                alert("Time is out or you're alone in the chat room, you can't change the name");
        }
        else if(!is_it_tag(newMessage.value))
        {
            self._rpc({
                model: "pos.chat",
                method: "send_field_updates",
                args: [newMessage.value,
                 '', session.uid]
            });
        }
        else
            alert("Nice try, but i've learned to evade tags");

        newMessage.value = '';
    }

    function showMessage(uid)
    {
        var i = NumInQueue(uid), num = all_messages[i].length - 1;
        var cnt = messages_cnt[i]++;
        var num = all_messages[i].length - 1;

        var mes_class = 'new-message-'+uid+'-'+cnt;
        all_messages[i][num].class = mes_class;
        var mes_id = 'single-message-'+uid+'-'+cnt;

        var message = document.getElementById('message-id-' + uid);
        var out = '';

        if(num > 0)
            out += '<li id="single-message-'+uid+'-'+
            (cnt - 1)+'" class="new-message-'+uid+'-'+(cnt - 1)+ '">'+
            all_messages[i][num - 1].text+'</li>';

        out += '<li id="'+mes_id+'" class="' + mes_class + '">'+
        all_messages[i][num].text+'</li>';

        out += '<audio src="/pos_chat/static/src/sound/puk.wav" autoplay="true"></audio>';

        message.innerHTML = out;
        if(num > 0)
            message_view('single-message-'+uid+'-'+(cnt - 1), false);

        message_view(mes_id, true);
        $("."+mes_class).fadeIn();
        all_timeOuts[i].push(window.setTimeout(Disappear,5000, uid));
    }

    function Disappear(uid)
    {
        if(all_messages[NumInQueue(uid)].length == 0) return;
        $('.'+all_messages[NumInQueue(uid)][0].class).fadeOut();
        all_messages[NumInQueue(uid)].shift();
        all_timeOuts[NumInQueue(uid)].shift();
    }
//---------Help functions part----------------------

    function message_view(message_id, display)
    {
        single_message = document.getElementById(message_id);
        single_message.style.setProperty('border-radius', '20%');
        single_message.style.setProperty('background','white');
        single_message.style.setProperty('top','10px');
        single_message.style.setProperty('width','100px');
        single_message.style.setProperty('font','14pt sans-serif');
        if(display)
            single_message.style.setProperty('display', 'none');
    }

    function CheckUserExists(uid)
    {
        for(var i = 0; i < chat_users.length; i++)
        {
            if(uid == chat_users[i].uid) return true;
        }
        return false;
    }

    // Checks out which num user has
    function NumInQueue(uid)
    {
        for(var i = 0; i < chat_users.length; i++)
        {
            if(chat_users[i].uid == uid) return i;
        }
    }

    function Push_new_message(i, uid, message)
    {
        return all_messages[i].push({
            text: message,
            user_id : uid,
            class : 'new-message-'+uid+'-'+all_messages[i].length,
            cnt : -1
        });
    }

    function DeleteUserData(uid)
    {
        var j = NumInQueue(uid);
        for(var i = j; i < chat_users.length; i++)
        {
            chat_users[i] = chat_users[i + 1];
            all_messages[i] = all_messages[i + 1];
            all_timeOuts[i] = all_timeOuts[i + 1];
        }
        messages_cnt.pop();
        chat_users.pop();
        all_messages.pop();
        all_timeOuts.pop();
    }

    function is_it_tag(str)
    {
        var left = 0, right = 0, slash = 0;
        for(var i = 0; i < str.length; i++)
        {
            if(str[i] == '<')left++;
            if(str[i] == '>')right++;
            if(str[i] == '/') slash++;
        }
        if(left == 2 && right == 2 && slash == 1)
            return true;
        else
            return false;
    }

    function is_it_name(str, parse)
    {
        var meet_double_dot = false;
        var temp = '';
        var temp_name = '';
        for(var i = 0; i < str.length; i++)
        {
            if(str[i] == ':') {
                meet_double_dot = true;
                continue;
            }

            if(str[i] == ' ' && !meet_double_dot) {
                continue;
            }

            if(!meet_double_dot)
                temp += str[i];
            else
                temp_name +=str[i];
        }
        if(parse)
        {
            return temp_name;
        }
        else
        {
            if(temp_name.length != str.length - 1
            && temp_name.length > 0 && (temp == 'Set' || temp == 'set'))
                return true;
            else
                return false;
        }
    }

    function all_names_changed()
    {
        for(var i = 0; i < new_names.length; i++)
        {
            if(new_names[i] == '') return false;
        }
        return true;
    }
//    $("." + message_class + "").fadeIn();
//    var disappear_bool_timer = window.setTimeout(function(){disappeared_first = true;},5000);

    return ChatButton;
});
