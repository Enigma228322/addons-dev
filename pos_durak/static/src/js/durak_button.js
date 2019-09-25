odoo.define('pos_chat_button', function (require){
      'use_strict';

    var gui = require('point_of_sale.gui');
    var screens = require('point_of_sale.screens');
    var session = require('web.session');
    var models = require('point_of_sale.models');

//-------------------- Variables -----------------------

    // All users messages stored here
    var all_messages = [];
    // Messages timeouts needs to store,
    // cause only this way we can know when to delete the message
    var all_timeOuts = [];
    // Information about every user
    var chat_users = [];
    // I don't remember why i added this,
    // but without it, app don't work:D
    var messages_cnt = [];
    // Are user in chat room right now
    var in_chat = false;
    // Full channel name
    var channel = "pos_chat";
    // Shows game stage
    var game_started = false;
    // Beated cards
    var beated = [];
    // Donald Trump
    var trump = '';
    // who moves
    var who_moves = -1;
    // Game mode
    var attacking = false;

//------------------------------------------------------

//-------------Help functions part----------------------
    // Checks out which num user has
    function NumInQueue(uid){
        for(let i = 0; i < chat_users.length; i++){
            if(chat_users[i].uid === uid) {
                return i;
            }
        }
    }

//------------------------------------------------------

//-------------- New screen defenition -----------------
    let ChatButton = screens.ActionButtonWidget.extend({
        template: 'ChatButton',
        button_click: function () {
            let self = this;
            this.gui.show_screen('custom_screen');
            // User in to the chat room
            in_chat = true;
            // Current users says that he connected to other users
            self._rpc({
                model: "pos.session",
                method: "send_field_updates",
                args: [session.name, '', 'Connect',
                 session.uid]
            });
        }
    });

//------------------------------------------------------

//---------- Text insertion buttons control ------------
    var CustomScreenWidget = screens.ScreenWidget.extend({
        template: 'CustomScreenWidget',
        show: function () {
          let self = this;
          this._super();
            // Returning to POS main screen
            this.$('.back').off().click(function () {
                self.gui.show_screen('products');

                self._rpc({
                    model: "pos.session",
                    method: "send_field_updates",
                    args: ['', '', 'Disconnect', session.uid]
                });

                DeleteMyData();
            });
            // Send new messages using button
            this.$('.next').off().click(function () {
                TakeNewMessage(false);
            });
            // Send new messages using 'Enter' key on keyboard
            this.$("#text-line").off().keyup(function(event){
                if(event.keyCode == 13){
                    TakeNewMessage(true);
                }
            });

            window.onclick=function(e){
                let elem = e ? e.target : window.event.srcElement;
                if(elem.id[0]+elem.id[1]+elem.id[2]+elem.id[3] === 'card'){
                   let num = '';
                   if(elem.id[elem.id.length - 2] !== '-') num = elem.id[elem.id.length - 2];
                   num += elem.id[elem.id.length - 1];
                   Move(num);
                }
                else if(elem.id === "ready-button"){
                    self._rpc({
                        model: "pos.session",
                        method: "game_started",
                        args: [session.uid, chat_users.length]
                    });
                }
            }
        }
    });

    // Defining new screen
    gui.define_screen({name:'custom_screen', widget: CustomScreenWidget});

    screens.define_action_button({
        'name': 'durak_button',
        'widget': ChatButton,
    });

//------------------------------------------------------

//---------- Set avatar and animation part -------------
    var radius = 200;

    function ShowCards(){
        let window = document.getElementById('main-window');
        let block = document.getElementById('cards');
        let me = NumInQueue(session.uid);
        let out = '', w = (60/chat_users[me].cards.length)/2;
        for(let i = 0; i < chat_users[me].cards.length; i++){
            let n = chat_users[me].cards[i];
            out+='<img type="button" src="/pos_durak/static/src/img/kards/'+
            n+'.png" id="card-'+n+'" class="card" style="right: '+(30 - i*w)+'%"></img>'
        }
        block.innerHTML = out;
    }

    function ShowUsers(){
        let window = document.getElementById('main-window');
        let out = '';
        let visible = 0;
        chat_users.forEach(function (item){
            let i = NumInQueue(item.uid);
            out += '<div class="chat-user-'+item.uid+'" id="picture-'+i+'">';
            out += '<div class="user-name" id="user-name-'+item.uid+'">'+chat_users[i].true_name+'</div>';
            out += '<img src="/web/image/res.users/' +
            item.uid + '/image_small" id="ava-' + i +'" class="avatar" style="border-radius:50%;"></img>';

            out += '<ul class="new-message" id="message-id-'+item.uid+'"></ul>';
            out += '</div>';
        });
        window.innerHTML = out;

        chat_users.forEach(function(item){
            SetPos(document.getElementById('picture-'+NumInQueue(item.uid)), item.uid);
        });
    }

    function SetPos(avatar, uid){
        let cnt = NumInQueue(uid) + 1;
        let action_window = document.getElementById('main-window');
        let angle = (2 * 3.1415 / chat_users.length) * cnt;
        let w = action_window.offsetWidth;
        let h = action_window.offsetHeight;

        let x = Math.trunc(radius*Math.cos(angle));
        let y = Math.trunc(radius*Math.sin(angle));

        avatar.style.setProperty('position', 'absolute');
        avatar.style.setProperty('left', w/2 - (avatar.offsetWidth / 2) + 'px');
        avatar.style.setProperty('top', h/2 - (avatar.offsetHeight / 2) + 'px');
        avatar.style.setProperty('transform','translate3d('+x+'px,'+y+'px,0px)');
        avatar.style.setProperty('transition','transform .3s ease-in-out');
    }

    function Second_scene(data){
        let who_attacks,str = data.message, who_defends;
        let attack_card = str[0] + (str[1] === ' ' ? '':str[1]);
        who_attacks[0] = Number((str[str.length - 2] === ' ' ? '':str[str.length - 2]) + str[str.length - 1]);
        who_defends = chat_users[next_to(who_attacks[0])].uid;
        who_attacks[1] = chat_users[next_to(who_defends)].uid;
        let window = document.getElementById('main-window');
        let w = window.offsetWidth, h = window.offsetHeight;
        let attacker_id_1 = document.getElementById('picture-'+NumInQueue(who_attacks[0]));
        let attacker_id_2 = chat_users.length === 2 ? null : document.getElementById('picture-'+NumInQueue(who_attacks[1]));
        let defender_id = document.getElementById('picture-'+NumInQueue(who_defends));
        if(attacker_id_1 !== null){
            let point = attacker_id_1.getBoundingClientRect(), x = point.left, y = point.top;
            attacker_id_1.style.left = w / 2 - attacker_id_1.offsetWidth;
            attacker_id_1.style.top = h * 0.8;
        }
        if(attacker_id_2 !== null){
            let point = attacker_id_2.getBoundingClientRect(), x = point.left, y = point.top;
            attacker_id_2.style.left = w / 2 + attacker_id_2.offsetWidth;
            attacker_id_2.style.top = h * 0.8
        }
        if(defender_id !== null){
            let point = defender_id.getBoundingClientRect(), x = point.left, y = point.top;
            defender_id.style.left = w / 2;
            defender_id.style.top = h * 0.8;
        }
    }
//------------------------------------------------------

//------ Message taking and showing functions ----------

    function TakeNewMessage(delete_last_char){
        let i = NumInQueue(session.uid);

        let newMessage = document.getElementById('text-line');

        if(newMessage.value === ''){
            newMessage.value = '';
            return;
        }

        let text = newMessage.value;
        if(delete_last_char) {
            text.substring(0, text.length - 2);
        }

        if(is_it_tag(newMessage.value, false)){
            text = is_it_tag(newMessage.value, true);
        }

        self._rpc({
            model: "pos.session",
            method: "send_field_updates",
            args: ['', text, 'Message', session.uid]
        });

        newMessage.value = '';
    }

    function showMessage(uid){
        let i = NumInQueue(uid), num = all_messages[i].length - 1;
        let cnt = messages_cnt[i]++;

        let mes_class = 'new-message-'+uid+'-'+cnt;
        all_messages[i][num].class = mes_class;
        let mes_id = 'single-message-'+uid+'-'+cnt;

        let message = document.getElementById('message-id-' + uid);
        if(typeof message === null) {
            return;
        }
        let out = '';

        if(num > 0){
            out += '<li id="single-message-'+uid+'-'+
            (cnt - 1)+'" class="new-message-'+uid+'-'+(cnt - 1)+ '">'+
            all_messages[i][num - 1].text+'</li>';
        }

        out += '<li id="'+mes_id+'" class="' + mes_class + '">'+
        all_messages[i][num].text+'</li>';

        out += '<audio src="/pos_durak/static/src/sound/msg.wav" autoplay="true"></audio>';

        message.innerHTML = out;
        if(num > 0){
            message_view('single-message-'+uid+'-'+(cnt - 1), false);
        }

        message_view(mes_id, true);
        $("."+mes_class).fadeIn();
        all_timeOuts[i].push(window.setTimeout(Disappear,15000, uid));
    }

    // Messages slow disapperaring
    function Disappear(uid){
        if(typeof all_messages[NumInQueue(uid)] === 'undefined') {return;}
        if(all_messages[NumInQueue(uid)].length === 0) {return;}
        $('.'+all_messages[NumInQueue(uid)][0].class).fadeOut();
        all_messages[NumInQueue(uid)].shift();
        all_timeOuts[NumInQueue(uid)].shift();
    }
//--------------------------------------------------

//---------Help functions part----------------------

    function message_view(message_id, display){
        let single_message = document.getElementById(message_id);
        single_message.style.setProperty('border-radius', '20%');
        single_message.style.setProperty('background','white');
        single_message.style.setProperty('top','10px');
        single_message.style.setProperty('width','100px');
        single_message.style.setProperty('font','14pt sans-serif');
        if(display){
            single_message.style.setProperty('display', 'none');
        }
    }

    function CheckUserExists(uid){
        for(let i = 0; i < chat_users.length; i++){
            if(uid === chat_users[i].uid) return true;
        }
        return false;
    }

    function Push_new_message(i, uid, message){
        return all_messages[i].push({
            text: message,
            user_id : uid,
            class : 'new-message-'+uid+'-'+all_messages[i].length,
            cnt : -1
        });
    }
    // Users all data deletion
    function DeleteUserData(uid){
        let j = NumInQueue(uid);
        for(let i = j; i < chat_users.length; i++){
            chat_users[i] = chat_users[i + 1];
            all_messages[i] = all_messages[i + 1];
            all_timeOuts[i] = all_timeOuts[i + 1];
        }
        messages_cnt.pop();
        chat_users.pop();
        all_messages.pop();
        all_timeOuts.pop();
    }

    function DeleteMyData(){
        chat_users = [];
        all_messages = [];
        all_timeOuts = [];
        messages_cnt = [];
        // User out of the chat room
        in_chat = false;
    }
    // Is this string the tag checking
    function is_it_tag(str, send)
    {
        let left = 0, right = 0, slash = 0;
        let text = '';
        for(let i = 0; i < str.length; i++){
            if(left + right === 2 && str[i] !== '<'){
                text += str[i];
            }
            if(str[i] === '<')left++;
            if(str[i] === '>')right++;
            if(str[i] === '/') slash++;
        }
        // If send mode is active
        if(send) {
            return text;
        }
        return (left === 2 && right === 2 && slash === 1) ? true : false;
    }

    function next_to(uid){
        return NumInQueue(uid) == chat_users.length - 1 ? 0 : NumInQueue(uid) + 1;
    }
//--------------------------------------------------

//--------------- Users relations part -----------------

    function AddNewMessage(data){
        let i = NumInQueue(data.uid);
        if(all_messages[i].length >= 2){
            clearTimeout(all_timeOuts[i][0]);
            Disappear(data.uid);
        }
        Push_new_message(i, data.uid, data.message);
        showMessage(data.uid);
    }

    function AddNewUser(user_data)
    {
        // If user connected too late
        if(game_started) return;

        chat_users.push({
            name : '',
            true_name : user_data.name,
            uid : user_data.uid,
            participate : false,
            allow_change_name: true,
            cards : []
        });

        all_messages.push([]);
        all_timeOuts.push([]);
        messages_cnt.push(0);
        if(user_data.uid === session.uid) { ShowUsers(); return; }

        // Tell to new user about current user
        window.setTimeout(function(){
            let i = NumInQueue(session.uid);
            self._rpc({
                model: "pos.session",
                method: "send_all_user_data_to",
                args: [chat_users[i].name, chat_users[i].true_name,
                chat_users[i].participate, chat_users[i].allow_change_name,
                session.uid, 'Exist', user_data.uid]
            });
        }, 200 * NumInQueue(session.uid) + 1);

        if(in_chat)
        {
            ShowUsers();
        }
    }

    function AddExistUser(data){
        chat_users.push({
            name : data.name,
            true_name : data.true_name,
            uid : data.uid,
            participate : data.participate,
            allow_change_name: data.allow,
            cards : []
        });
        let n = chat_users.length;
        let temp = chat_users[n - 1];
        chat_users[n - 1] = chat_users[n - 2];
        chat_users[n - 2] = temp;

        all_messages.push([]);
        all_timeOuts.push([]);
        messages_cnt.push(0);

        ShowUsers();
    }

    function DeleteUser(user_id){
        DeleteUserData(user_id);
        if(user_id !== session.uid){
            ShowUsers();
        }
    }

    function Distribute_cards(data, took_cards){
        if(took_cards){
            let ses = NumInQueue(session.uid);
            let str = data.message;
            for(let i = 0; i < str.length - 1; i++){
                let num = '';
                if(str[i] !== ' '){
                    if(str[i + 1] !== ' '){
                        chat_users[ses].cards.push(str[i] + str[i + 1]);
                        i++;
                    }
                    else
                        chat_users[ses].cards.push(str[i]);
                }
            }
            ShowCards();
        }
        else if(session.uid === chat_users[0].uid)
        {
            self._rpc({
                model: "pos.session",
                method: "distribution"
            });
        }
    }

    function SaveExtraCards(data){
        trump = data.name;
        var str = data.message;
        for(var i = 0; i < str.length - 1; i++){
            var num = '';
            if(str[i] !== ' '){
                if(str[i + 1] !== ' '){
                    beated.push(str[i] + str[i + 1]);
                    i++;
                }
                else
                    beated.push(str[i]);
            }
        }
    }

    function Move(card_num){
        if(who_moves === -1){
            who_moves = chat_users[0].uid;
        }
        else{
            who_moves = next_to(who_moves);
        }

        if(who_moves === session.uid || next_to(who_moves) === session.uid){
            self._rpc({
                model: "pos.session",
                method: "Moved",
                args: [session.uid, card_num]
            });
        }
        else{
            alert('Not so fast, its not your turn!');
        }
    }

//------------------------------------------------------
//-------------- Longpooling functions -----------------

    let PosModelSuper = models.PosModel;
    models.PosModel = models.PosModel.extend({

        initialize: function () {
            PosModelSuper.prototype.initialize.apply(this, arguments);
            let self = this;
            // Listen to 'pos_chat' channel
            self.bus.add_channel_callback("pos_chat", self.on_barcode_updates, self);
        },

        on_barcode_updates: function(data){
            if(!in_chat){
                return;
            }
            let self = this;
            // If someone connected to the chat
            if(data.command === 'Connect'){
                if(!CheckUserExists(data.uid)){
                    AddNewUser(data);
                }
            }
            else if(data.command === 'Disconnect'){
                DeleteUser(data.uid);
            }
            else if(data.command === 'Message'){ // If someone throwed a message
                AddNewMessage(data);
            }
            else if(data.command === 'Exist'){
                    AddExistUser(data);
            }
            else if(data.command === 'game_started' && chat_users.length >= 2){
                game_started = true;
                Distribute_cards(data, false);
            }
            else if(data.command === 'Cards'){
                Distribute_cards(data, true);
            }
            else if(data.command === 'Extra'){
                SaveExtraCards(data);
            }
            else if(data.command === 'Move'){
                attacking = true;
                Second_scene(data);
            }
        },
    });
//------------------------------------------------------
    return ChatButton;
});
