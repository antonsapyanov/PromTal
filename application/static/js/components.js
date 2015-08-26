var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var commentsStream = new Rx.Subject();

var CommentsCounter = React.createClass({displayName: "CommentsCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    recount: function(data){
        var count = 0;
        for(var i in data.comments) {
            if(data.comments[i].status != 'deleted') count++;
        }
        this.setState({count: count})
    },
    componentWillMount: function(){
        var self = this
        var entity = this.props.entity
        var entity_id = this.props.entity_id

        commentsStream.filter(function(data){ return data.action == 'update' &&
                data.entity == entity &&
                data.entity_id == entity_id })
            .subscribe(function(data){
                self.recount(data)
        })
    },
    render: function() {
        return(
            React.createElement("div", null, React.createElement("span", {className: "fa fa-comments-o"}), this.state.count)
        )
    }
})
var CommentForm = React.createClass({displayName: "CommentForm",
    getDefaultProps: function(){
        return {comment: {}}
    },
    getInitialState: function() {
        return {text: '', disabled: true, stream: new Rx.Subject(), media: []}
    },
    onSuccess: function(data){
        this.setState({text: ''})
        this.props.stream.onNext({action: 'save', comment: this.props.comment, new_comment: data.comment})
        this.props.stream.onNext({action: 'quote', comment: null})
        this.props.stream.onNext({action: 'edit', comment: null})
        this.state.stream.onNext({action: 'clearMedia'});
        this.updateSubmitDisabled()
    },
    onChange: function(e){
        this.state.text = e.target.value
        this.setState({text: this.state.text})
        this.state.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onKeyDown: function(e){
        if(e.key == 'Enter' && e.ctrlKey && !!this.state.text.trim() && !this.state.disabled) {
            var form = this.refs.form
            e['target'] = form.getDOMNode()
            form.onSubmit(e)
        }

    },
    updateSubmitDisabled: function(){
        var opened = this.refs.mediaUploader ? this.refs.mediaUploader.state.opened : false
        var hasData = this.refs.mediaHolder ? this.refs.mediaHolder.state.count == 0 && !this.state.text : false
        this.state.disabled = opened || hasData
        if(this.isMounted())
            this.setState({disabled: this.state.disabled })
    },
    componentWillMount: function(){
        this.state.text = this.props.comment.text
    },
    componentDidMount: function(){
        var self = this
        this.state.stream
            .filter(function(data){ return data.action == 'updateSubmitDisabled' && self.isMounted()})
            .subscribe(self.updateSubmitDisabled)
        this.updateSubmitDisabled()
    },
    render: function() {
        if(!current_user.is_authorized) return null
        var entity = this.props.entity || this.props.comment.entity
        var entity_id = this.props.entity_id || this.props.comment.entity_id

        if(!(entity && entity_id) && !this.props.quote_for && !this.props.comment) return null

        var action = !this.props.quote_for ? '/comment' : '/comment/quote'
        action += !this.props.comment.id ? '/new' : '/edit/'+this.props.comment.id

        return(
            React.createElement("li", {className: "comment form"}, 
                React.createElement(UserIcon, {user: current_user}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "text"}, 
                        React.createElement(AJAXForm, {ref: "form", className: "custom-form", action: action, method: "post", onSuccess: this.onSuccess}, 
                            React.createElement("div", {className: "wrapper"}, 
                                React.createElement("input", {type: "hidden", name: "entity_name", value: this.props.entity}), 
                                React.createElement("input", {type: "hidden", name: "entity_id", value: this.props.entity_id}), 
                                React.createElement("input", {type: "hidden", name: "quote_for", value: this.props.quote_for}), 
                                React.createElement(TextArea, {ref: "comment", 
                                    focus: !!this.props.quote_for, name: "comment", 
                                    autosize: true, 
                                    onKeyDown: this.onKeyDown, 
                                    onChange: this.onChange, 
                                    placeholder: "Оставить комментарий", 
                                    value: this.state.text}), 
                                React.createElement("div", {className: "right-buttons"}, 
                                    React.createElement(MediaUploader, {ref: "mediaUploader", stream: this.state.stream, holder: this}), 
                                    React.createElement("button", {type: "submit", 
                                        disabled: this.state.disabled, 
                                        className: "button send", 
                                        title: "Отправить"}, 
                                        React.createElement("span", {className: "fa fa-send"})
                                    )
                                ), 
                                React.createElement(MediaHolder, {ref: "mediaHolder", files: this.props.comment.files, stream: this.state.stream, holder: this})
                            )
                        )
                    )
                ), 
                this.props.quotes
            )
        )
    }
})

var Comments = React.createClass({displayName: "Comments",
    getInitialState: function() {
        return {
            all_comments: {},
            comments: [],
            quotes: [],
            stream: new Rx.Subject()
        }
    },
    componentWillMount: function(){
        var self = this
        $.getJSON('/comment/'+this.props.entity+'/'+this.props.entity_id+'/json/all', function(res){
            var comments = []
            var quotes = {}
            for(var i in res.data){
                var quote_for = res.data[i].quote_for_id;
                if(!!quote_for){
                    quotes[quote_for] = quotes[quote_for] || []
                    quotes[quote_for].unshift(res.data[i]);
                }else{
                    comments.push(res.data[i])
                }
                self.state.all_comments[res.data[i].id] = res.data[i]
            }
            self.setState({comments: comments, quotes: quotes})
        });

        commentsStream.filter(function(data) {
            return data.sender != self &&
                data.entity == self.props.entity &&
                data.entity_id == self.props.entity_id
        }).subscribe(function(data){
            self.state.stream.onNext(data)
        });

        this.state.stream.subscribe(function(data){
            data.entity = self.props.entity;
            data.entity_id = self.props.entity_id;
            data.sender = self;
            commentsStream.onNext(data)
        });

        this.state.stream.filter(function(data){ return data.action == 'save'}).subscribe(function(data){
            var comment = data.comment;
            var new_comment = data.new_comment;
            var quote_for = new_comment.quote_for_id;

            if(!comment.id) {
                self.state.all_comments[new_comment.id] = new_comment;
                if(!quote_for) {
                    self.state.comments.unshift(new_comment)
                }else{
                    self.state.quotes[quote_for] = self.state.quotes[quote_for] || []
                    self.state.quotes[quote_for].push(new_comment)
                }
            }else{
                if(!quote_for)
                    self.state.comments[self.state.comments.indexOf(comment)] = new_comment;
                else if(!!self.state.quotes[quote_for])
                    self.state.quotes[quote_for][self.state.quotes[quote_for].indexOf(comment)] = new_comment;
                self.state.all_comments[comment.id] = new_comment
            }
            self.setState({comments: self.state.comments, quotes: self.state.quotes});
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        });

        this.state.stream.filter(function(data){ return data.action == 'delete'}).subscribe(function(data){
            var comment = data.comment;
            var quotes = self.state.quotes;
            var comments = self.state.comments;
            var all_comments = self.state.all_comments;

            var quote_for_id = comment.quote_for_id;
            var list = !quote_for_id ? comments : quotes[quote_for_id];
            var i = list.indexOf(comment);

            function delete_parent(comment) {
                if(!comment) return;
                if(!quotes[comment.id].length && comment.status == 'deleted') {
                    delete all_comments[comment.id];
                    quotes[comment.quote_for_id].splice(quotes[comment.quote_for_id].indexOf(comment), 1);
                    if(!comment.quote_for_id)
                        comments.splice(comments.indexOf(comment), 1);
                    delete_parent(all_comments[comment.quote_for_id])
                }
            }

            list.splice(i, 1);
            delete all_comments[comment.id];
            delete_parent(all_comments[comment.quote_for_id])

            self.setState({comments: self.state.comments, quotes: self.state.quotes})
            self.state.stream.onNext({action: 'update', comments: self.state.all_comments})
        })

    },
    render: function() {
        var className = (this.props.className || '') + ' comments';
        var self = this
        return(
            React.createElement("div", null, 
                React.createElement("ul", {className: className}, 
                    React.createElement(CommentForm, {entity: this.props.entity, entity_id: this.props.entity_id, stream: this.state.stream, root: this}), 
                    this.state.comments.map(function(comment, i) {
                        return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'comment_'+comment.id, comment: comment, stream: self.state.stream, root: self});
                    })
                )
            )
        )
    }
})

var Quotes = React.createClass({displayName: "Quotes",
    render: function() {
        var self = this;
        var comments = this.props.comments || [];
        return(
            React.createElement("ul", {className: "quotes"}, 
                comments.map(function(comment, i) {
                    return React.createElement(Comment, {entity: self.props.entity, entity_id: self.props.entity_id, key: 'quote_'+i, comment: comment, stream: self.props.stream, root: self.props.root});
                }), 
                this.props.quoteForm
            )
        )
    }
})

var Comment = React.createClass({displayName: "Comment",
    getInitialState: function(){
        return { 'showForm': null }
    },
    showQuoteForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'quote', comment: this})
    },
    showEditForm: function(e){
        e.preventDefault();
        this.props.stream.onNext({action: 'edit', comment: this})
    },
    deleteComment: function(e){
        e.preventDefault();
        var self = this;
        Popup.show({
            title: 'Удалить комментарий',
            content: 'Вы уверены,что хотите удалить комментарий?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        $.ajax({
                            url: '/comment/'+self.props.comment.id,
                            type: 'DELETE',
                            success: function(res) {
                                if(!res.comment)
                                    self.props.stream.onNext({action: 'delete', comment: self.props.comment})
                                else
                                    self.props.stream.onNext({action: 'save', comment: self.props.comment, new_comment: res.comment})
                                popup.onClose()
                            }
                        });
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    componentWillMount: function(){
        var self = this;
        this.props.stream.filter(function(data){ return data.action == 'quote'}).subscribe(function(data){
            if(self.isMounted()) {
                if(self.state.showForm) self.setState({some: null});
                if(self == data.comment) self.setState({showForm: 'quote'})
            }
        })
        this.props.stream.filter(function(data){ return data.action == 'edit'}).subscribe(function(data){
            if(self.isMounted()) {
                if (self.state.showForm) self.setState({showForm: null});
                if (self == data.comment) self.setState({showForm: 'edit'});
            }
        })
    },
    componentDidMount: function(){
        $(this.getDOMNode()).find("a.image").fancybox({});
        $(window).trigger('resize');
    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    render: function() {
        var self = this;
        var comment = this.props.comment;
        var root = this.props.root;
        var answerButton = null;
        var deleteButton = null;
        var editButton = null;
        var media = null;
        var quoteForm = null;
        var editForm = null;
        var quotes = null;
        var text = markup(comment.text);


        if(this.state.showForm == 'quote')
            quoteForm =  React.createElement(CommentForm, {entity: comment.entity, entity_id: comment.entity_id, stream: this.props.stream, quote_for: comment.id, root: root});

        quotes = React.createElement(Quotes, {quoteForm: quoteForm, comments: root.state.quotes[comment.id], entity: this.props.entity, entity_id: this.props.entity_id, stream: this.props.stream, root: root})

        if(this.state.showForm == 'edit')
            editForm = React.createElement(CommentForm, {quotes: quotes, comment: comment, stream: this.props.stream, root: root});

        if(!editForm) {
            if (current_user.is_authorized && comment.status != 'deleted') {
                if (current_user.id != comment.author.id) {
                    answerButton = React.createElement("a", {href: "#", className: "answer-button", onClick: this.showQuoteForm}, "Ответить")
                } else {
                    deleteButton = React.createElement("a", {href: "#", className: "delete-button", onClick: this.deleteComment}, "Удалить");
                    editButton = React.createElement("a", {href: "#", className: "edit-button", onClick: this.showEditForm}, "Редактировать")
                }
            }
            if (comment.files.length) {
                media = (
                    React.createElement("div", {ref: "mediaHolder", className: "media-holder  count-" + comment.files.length}, 
                    comment.files.map(function (file) {
                        return (
                            React.createElement("div", {key: "comment_" + comment.id + "_id_" + file.id, className: "media approved", style: {backgroundImage: 'url("'+file.url+'")'}}, 
                                React.createElement("a", {href: file.origin, "data-fancybox-group": "comment_" + comment.id, className: "image"}, 
                                    React.createElement("img", {src: file.url, alt: "", onLoad: self.onImageLoad})
                                )
                            )
                        )
                    })
                    )
                )
            }
            if (comment.status == 'deleted') {
                text = '<span class="system-message" >' + comment.text + '</span>';
                media = null
            }
        }

        if(!!editForm) return editForm

        var dateTime = niceDateFormat(comment.datetime)
        var modifyDateTime = niceDateFormat(comment.modify_datetime)
        return(
            React.createElement("li", {className: "comment"}, 
                React.createElement(UserIcon, {user: comment.author}), 
                React.createElement("div", {className: "message frame"}, 
                    React.createElement("div", {className: "fa fa-caret-left arrow"}), 
                    React.createElement("div", {className: "header"}, 
                        React.createElement("a", {href: '/user/profile/'+comment.author.id}, comment.author.full_name), 
                        React.createElement("span", {className: "datetime"}, comment.status == 'modified' ? 'Изменено '+modifyDateTime.toLowerCase() : dateTime), 
                        React.createElement(LikesCounter, {title: "Понравилось", count: comment.votes_count || 0, entity: "comment", entity_id: comment.id, my: comment.my_vote}), 
                        deleteButton, 
                        editButton, 
                        answerButton
                    ), 
                    React.createElement("div", {className: "text", dangerouslySetInnerHTML: {__html: text}}), 
                    media, 
                    React.createElement("div", {className: "footer"})
                ), 
                quotes
             )
        )
    }
})



$(document).ready(function(){
    $('.comments-counter').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommentsCounter, {entity: entity, entity_id: entity_id, count: count}), $(this)[0]);
    });

    $('.comments-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        React.render( React.createElement(Comments, {entity: entity, entity_id: entity_id}), $(this)[0]);
    })
});

var communityStream = new Rx.Subject();
var CommunityMembersCounter = React.createClass({displayName: "CommunityMembersCounter",
    getInitialState: function() {
        return {count: this.props.count || 0}
    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});

        });
    },
    render: function() {
        var title = 'учасников';
        var mod_count = this.state.count % 10;
        if(mod_count == 1) title = 'учасник';
        if(mod_count > 1 && mod_count < 5) title = 'учасника';
        if(this.state.count % 100 > 10 && this.state.count % 100 < 20) title = 'учасников';
        return(
            React.createElement("div", {className: "members-counter"}, 
                React.createElement("span", null, this.state.count, " ", title)
            )
        )
    }
});

var CommunitySubscriptionButton = React.createClass({displayName: "CommunitySubscriptionButton",
    getInitialState: function() {
        return {subscribed: this.props.subscribed, status: this.props.status }
    },
    onJoin: function(){
        if(this.state.subscribed) return;
        var self = this;
        $.post('/community/subscription/' + this.props.community_id, {subscription: 'subscribe'},"json")
        .done(function(res){
            if(res.status == 'ok'){
                if(res.community.type == 'private') {
                    Popup.show({ content: 'Ваша заявка принята на рассмотрение.' });
                    self.setState({subscribed: res.subscribed, status: 'waiting'});
                }else{
                     if(self.props.reload) {
                         window.location.reload()
                     }else{
                         communityStream.onNext({action: 'updateMembersCount', community: res.community, count: res.community.count_members});
                         self.setState({subscribed: res.subscribed});
                     }

                }
            }
        });
    },
    onLeave: function(){
        if(!this.state.subscribed && this.state.status != 'waiting') return;
        var self = this;
        if(this.state.status == 'waiting') {
            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
            .done(function(res){
                if(res.status == 'ok'){
                    communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                    self.setState({status: undefined, subscribed: res.subscribed});
                }
            });
        }else{
            Popup.show({
                title: 'Покинуть группу',
                content: 'Вы уверены,что хотите покинуть группу?',
                closeButton: false,
                buttons: [
                    {
                        name: 'Да',
                        className: 'left',
                        action: function(popup){
                            $.post('/community/subscription/' + self.props.community_id, {subscription: 'unsubscribe'},"json")
                            .done(function(res){
                                if(res.status == 'ok'){
                                    if(self.props.reload) {
                                        window.location.reload();
                                    }else{
                                        communityStream.onNext({action: 'updateMembersCount',  community: res.community, count: res.community.count_members});
                                        self.setState({subscribed: res.subscribed});
                                        popup.onClose();
                                    }
                                }
                            });
                        }
                    },
                    {
                        name: 'Нет',
                        className: 'right',
                        action: function(popup){
                            popup.onClose()
                        }
                    },
                ]
            })
        }


    },
    componentWillMount: function(){
        var self = this;
        communityStream.filter(function(data){return data.action == 'updateMembersCount' && data.community.id == self.props.community_id}).subscribe(function(data){
           self.setState({count: data.count});
        });
    },
    render: function() {
        var status = this.state.status;
        var button = !this.state.subscribed || status == 'rejected' ?
            React.createElement("button", {className: "community-join", onClick: this.onJoin}, "Присоединиться"):
            status == 'waiting' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Отменить заявку") :
            status == 'accepted' ?
                React.createElement("button", {className: "community-leave", onClick: this.onLeave}, "Покинуть") :
                null

        return button
    }
});


var CommunityMember = React.createClass({displayName: "CommunityMember",
    getInitialState: function() {
        return {
            user: {
                id: this.props.member_id,
                full_name: this.props.member_name,
                photo: this.props.member_photo,
                description: this.props.member_description,
                status: this.props.member_status
            }
        }
    },
    sendRequest: function(type){
         var self = this;
        $.post('/community/' + this.props.community_id + '/'+type+'/member/'+ this.state.user.id, "json")
        .done(function(res){
            if(res.status == 'ok'){
                self.state.user.status = res.user.status;
                self.setState({user:  self.state.user})
            }
        });
    },
    onAccept: function(){
       this.sendRequest('accept');
    },
    onReject: function(){
        this.sendRequest('reject');
    },
    onDelete: function(){
        var self = this;
        Popup.show({
            title: 'Удалить пользователя',
            content: 'Вы уверены,что хотите удалить пользователя из группы?',
            closeButton: false,
            buttons: [
                {
                    name: 'Да',
                    className: 'left',
                    action: function(popup){
                        self.sendRequest('reject');
                        popup.onClose();
                    }
                },
                {
                    name: 'Нет',
                    className: 'right',
                    action: function(popup){
                        popup.onClose()
                    }
                },
            ]
        })
    },
    render: function() {
        var description = this.state.user.description;
        var is_owner = this.props.community_owner_id == current_user.id;

        if(!is_owner && this.state.user.status == 'waiting') return null;
        if(this.state.user.status == 'rejected') return null;

        if(is_owner){
            if(this.state.user.status == 'waiting') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button", onClick: this.onAccept}, "Принять"), 
                        React.createElement("a", {className: "button reject", onClick: this.onReject}, "Отклонить")
                    )
                )
            }else if(this.state.user.status == 'accepted') {
                description = (
                    React.createElement("div", {className: "buttons"}, 
                        React.createElement("a", {className: "button delete", onClick: this.onDelete}, "Удалить")
                    )
                )
            }
        }
        description = description ? React.createElement("div", {className: "description"}, description) : null;
        return (
            React.createElement("div", {className: "member user-frame"}, 
                React.createElement(UserIcon, {user: this.state.user}), 
                React.createElement("div", {className: "info"}, 
                    React.createElement("div", {className: "name"}, React.createElement("a", {href: "/user/profile/" + this.state.user.id}, this.state.user.full_name)), 
                    description
                )
            )
        )
    }
});


$(document).ready(function(){
    $('.members-counter-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        React.render( React.createElement(CommunityMembersCounter, {community_id: community_id, count: count}), $(this)[0]);
    });

    $('.community-subscription-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var subscribed = Boolean($(this).attr('data-subscribed') == 'True');
        var status = $(this).attr('data-status');
        var reload = $(this).attr('data-reload') == 'True' ? true : false;
        React.render( React.createElement(CommunitySubscriptionButton, {community_id: community_id, subscribed: subscribed, status: status, reload: reload}), $(this)[0]);
    });

    $('.community-member-component').each(function(){
        var community_id = $(this).attr('data-community-id');
        var community_owner_id = $(this).attr('data-community-owner-id');
        var member_id = $(this).attr('data-member-id');
        var member_name = $(this).attr('data-member-name');
        var member_photo = $(this).attr('data-member-photo');
        var member_status = $(this).attr('data-member-status');
        var member_description = $(this).attr('data-member-description');
        React.render(
            React.createElement(CommunityMember, {
                community_id: community_id, 
                community_owner_id: community_owner_id, 
                member_id: member_id, 
                member_name: member_name, 
                member_photo: member_photo, 
                member_status: member_status, 
                member_description: member_description}
            ), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=200&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
          success: function(data){
            //console.log(data['aaData']);
            self.setState({userList:[]});
            self.setState({userList:data['aaData']});
            //console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        //console.log(users);
        //console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=200&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
          success: function(data){
            //console.log(data['aaData']);
            self.setState({userList:[]});
            self.setState({userList:data['aaData']});
            //console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        //console.log(users);
        //console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});
var FieldError = React.createClass({displayName: "FieldError",
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               React.createElement("div", {className: "error-wrapper"}, React.createElement("div", {className: "error"}, this.state.text))
            )
    }
})

var Input = React.createClass({displayName: "Input",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("input", React.__spread({},  this.props, {onChange: this.onChange})), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var Select = React.createClass({displayName: "Select",
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("select", React.__spread({},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var TextArea = React.createClass({displayName: "TextArea",
    updateHeight: function(){
        if(this.props.autosize){
            var dom = this.refs.textarea.getDOMNode();
            dom.style.height = 0
            dom.style.height =  dom.offsetHeight+ (dom.scrollHeight - dom.offsetHeight)+'px'
        }
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    componentDidMount: function(event) {
        this.updateHeight()
        tinymceInit()
        if(this.props.focus)
            this.refs.textarea.getDOMNode().focus()
    },
    componentDidUpdate: function() {
        this.updateHeight()
    },
    render: function() {
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("textarea", React.__spread({ref: "textarea"},  this.props, {onChange: this.onChange}), this.props.children), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var ImageLoader = React.createClass({displayName: "ImageLoader",
    getInitialState: function(){
        return {value: this.props.value}
    },
    onChange: function(event) {
        this.refs.error.setState({text: ''})

        var self = this;
        var input = this.refs.image.getDOMNode();
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({value: e.target.result});
            }
            reader.readAsDataURL(input.files[0]);
        }
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        var preview = this.state.value ? {backgroundImage: 'url("'+this.state.value+'")'} : {} ;
        return(
            React.createElement("div", {className: "field-wrapper"}, 
                React.createElement("div", {className: "image-loader"}, 
                    React.createElement("input", {onChange: this.onChange, type: "file", ref: "image", name: this.props.name || 'image'}), 
                    React.createElement("div", {className: "image-preview", style: preview})
                ), 
                React.createElement(FieldError, {ref: "error", registerError: this.props.registerError})
            )
        )
    }
});

var AJAXForm = React.createClass({displayName: "AJAXForm",
    getInitialState: function() {
        return {errors: {}, data: {}, processing: false};
    },
    registerError: function(name, index) {
        var self = this
        self.fields = self.fields || {}
        function _registerError(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerError
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name]) {
                var field = this.fields[name] && this.fields[name][i]
                if(!!field) field.setState({text: errors[name][i][0].message})
            }

    },
    onSubmit: function(e) {
        e.preventDefault();
        if(this.state.processing) return false;

        this.state.processing = true;
        var self = this
        var form = e.target;
        $.ajax({
            type: form.getAttribute('method') || 'POST',
            url: form.getAttribute('action') || '',
            data: new FormData(form),
            cache: false,
            contentType: false,
            processData: false,

            success: function(json) {
                self.showErrors(json.errors)
                if(typeof self.props.onDone == 'function')
                    self.props.onDone(json);
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }
                if(self.isMounted()) self.setState({processing: false});
            },
            error: function(){
                if(self.isMounted())self.setState({processing: false});
            }
         });
    },
    childrenWithErrors: function(root, parent) {
        var self = this
        var counter = {}
        parent = parent || root

        if(typeof parent.props.children == 'string')
            return parent.props.children

        return React.Children.map(parent.props.children, function (child) {
            if(!React.isValidElement(child))return child
            var name = child.props.name
            counter[name] = counter[name] || 0
            var index = counter[name]++
            var children = undefined

            if(!!child.props.children)
                children = self.childrenWithErrors(root, child)

            var clone = React.cloneElement(child, {registerError: self.registerError(name, index)}, children)
            return clone;
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            React.createElement("form", React.__spread({},  this.props, {onSubmit: this.onSubmit}), this.children)
        )
    }
});

var SearchUsers = React.createClass({displayName: "SearchUsers",
    componentDidMount: function(e){
        var self = this;
        var inputNode = this.refs.input.getDOMNode();
        this.onInputChangeObservable = Rx.Observable.fromEvent(
                inputNode, 'keydown'
            ).debounce(200)
        this.onChangeObserver = this.onInputChangeObservable.subscribe(function(e){
                this.setState({userName:e.target.value});
                var name = e.target.value;
                var self = this;
                if(name) {
                    $.ajax({
                      url: "/admin/users_search_json?sEcho=3&iColumns=12&sColumns=%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C%2C&iDisplayStart=0&iDisplayLength=21&mDataProp_0=0&sSearch_0=&bRegex_0=false&bSearchable_0=true&bSortable_0=true&mDataProp_1=1&sSearch_1=&bRegex_1=false&bSearchable_1=true&bSortable_1=true&mDataProp_2=2&sSearch_2=&bRegex_2=false&bSearchable_2=true&bSortable_2=true&mDataProp_3=3&sSearch_3=&bRegex_3=false&bSearchable_3=true&bSortable_3=true&mDataProp_4=4&sSearch_4=&bRegex_4=false&bSearchable_4=true&bSortable_4=true&mDataProp_5=5&sSearch_5=&bRegex_5=false&bSearchable_5=true&bSortable_5=true&mDataProp_6=6&sSearch_6=&bRegex_6=false&bSearchable_6=true&bSortable_6=true&mDataProp_7=7&sSearch_7=&bRegex_7=false&bSearchable_7=true&bSortable_7=true&mDataProp_8=8&sSearch_8=&bRegex_8=false&bSearchable_8=true&bSortable_8=true&mDataProp_9=9&sSearch_9=&bRegex_9=false&bSearchable_9=true&bSortable_9=true&mDataProp_10=10&sSearch_10=&bRegex_10=false&bSearchable_10=true&bSortable_10=true&mDataProp_11=11&sSearch_11=&bRegex_11=false&bSearchable_11=true&bSortable_11=true&sSearch="+name+"&bRegex=false&iSortCol_0=0&sSortDir_0=asc&iSortingCols=1&_=1440505648017",
                      success: function(data){
                        self.setState({userList:[]});
                        self.setState({userList:data['aaData']});
                      }
                    });
                } else {
                    self.setState({userList:[]});
                }
            }.bind(this))
    },

    componentWillUnmount: function(){
        this.onChangeObserver.dispose()
    },

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {ref: "input", type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Введите данные пользователя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list user-list"}, 
                users.map(function(user) {
                  return React.createElement(SearchUser, {userIn: user});
                })
                )
            )
        );

    }
});

var SearchUser = React.createClass({displayName: "SearchUser",
    clickedUser: function(e){
        e.preventDefault();
        var self = this;
        document.location.href = '/user/profile/'+self.props.userIn[0];
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {onClick: self.clickedUser}, 
                  React.createElement("div", {className: "user-frame frame"}, 
                      React.createElement("div", {className: "user-icon"}, 
                          React.createElement("img", {src: user[11], className: "media-object foto-small"})
                      ), 
                      React.createElement("div", {className: "info"}, 
                          React.createElement("div", {className: "name"}, React.createElement("a", {href: "#", onClick: self.clickedUser}, user[1])), 
                          React.createElement("div", {className: "description", title: user[10]}, user[10])
                      )
                  )
              )
        );
    }
});

var ManageUsers = React.createClass({displayName: "ManageUsers",

    getInitialState: function(){
        return { userName: '', userList: []};
    },

    userNameChange: function(e){
        this.setState({userName:e.target.value});
        var name = e.target.value;
        var self = this;
        console.log(name);

        $.ajax({
          url: "/admin/company-structure/get-users/"+self.props.dep_id+"/"+name+"/",
          success: function(data){
            //console.log(data['users']);
            self.setState({userList:[]});
            var arr = data['users']
            self.setState({userList:data['users']});
            console.log(self.state.userList);
          }
        });

    },

    render: function() {
        var self = this;
        var users = self.state.userList;
        console.log(users);
        console.log(self.props.dep_id);
        return (
            React.createElement("div", null, 
                React.createElement("div", {className: "input-group fio"}, 
                  React.createElement("span", {className: "input-group-addon", id: "basic-addon1"}, React.createElement("i", {className: "fa fa-search"})), 
                  React.createElement("input", {type: "text", className: "form-control", value: this.state.userName, onChange: this.userNameChange, placeholder: "Фамилия или имя", "aria-describedby": "basic-addon1"})
                ), 
                React.createElement("ul", {className: "media-list"}, 
                users.map(function(user) {
                  return React.createElement(UserInSearch, {userIn: user, dep_id: self.props.dep_id});
                })
                )
            )
        );

    }
});

var UserInSearch = React.createClass({displayName: "UserInSearch",
    clickedUser: function(){
        var self = this;
        $.ajax({
          url: "/admin/company-structure/set-user-dep/"+self.props.dep_id+"/"+self.props.userIn['u_id']+"/",
          success: function(json) {
                if(json.status == 'ok'){
                    location.reload();
                }
          }
        });
    },

    render: function() {
        var self = this;
        var user = self.props.userIn;
        return (
              React.createElement("li", {className: "media btn btn-default user-in-search", onClick: self.clickedUser}, 
                React.createElement("div", {className: "media-left"}, 
                    React.createElement("img", {src: user.src_foto, className: "media-object foto-small"})
                ), 
                React.createElement("div", {className: "media-body"}, 
                  React.createElement("h4", {className: "media-heading"}, user.full_name), 
                  user.dep_name
                )
              )
        );
    }
});


var TagField = React.createClass({displayName: "TagField",
    getInitialState: function(){
        return {value: '', tags: this.props.tags || []}
    },
    onKeyPress: function(e) {
        if(e.key == 'Enter') e.preventDefault()
        if(e.key == 'Enter' && !!this.state.value.trim()) {
            e.preventDefault()
            this.state.tags.push(this.state.value)
            this.setState({value: '', tags: this.state.tags})
        }
    },
    //onKeyDown: function(e) {
    //    if(e.key == 'Backspace' && !this.state.value.trim() ) {
    //        this.state.tags.pop()
    //        this.setState({value: '', tags: this.state.tags})
    //    }
    //},
    onChange: function(e){
        this.setState({value: e.target.value})
    },
    focusInput: function(){
        this.refs.input.getDOMNode().focus()
    },
    render: function(){
        var self = this
        return (
            React.createElement("div", {className: "tag-field", onClick: this.focusInput}, 
                this.state.tags.map(function(tag, i) {
                    return React.createElement(Tag, {value: tag, key: "tag_"+i, name: self.props.name || 'tag'})
                }), 
                React.createElement("div", {className: "value-wrapper"}, 
                    React.createElement("span", null, this.state.value), 
                    React.createElement("input", {ref: "input", type: "text", value: this.state.value, onKeyPress: this.onKeyPress, onKeyDown: this.onKeyDown, onChange: this.onChange})
                )
            )
        )
    }
});

var Tag = React.createClass({displayName: "Tag",
    getInitialState: function(){
        return {deleted: false}
    },
    onClick: function(e) {
        e.stopPropagation()
    },
    onDelete: function(e){
        e.stopPropagation()
        this.setState({deleted: true})
    },
    render: function(){
        if(this.state.deleted || !this.props.value.trim())
            return null
        else
            return (
                React.createElement("div", {className: "tag", onClick: this.onClick}, 
                    React.createElement("input", {type: "hidden", name: this.props.name, value: this.props.value.trim()}), 
                    React.createElement("span", {className: "fa fa-tag"}), 
                    this.props.value, 
                    React.createElement("span", {className: "fa fa-times delete", onClick: this.onDelete})
                )
            )
    }
})

var MediaUploader = React.createClass({displayName: "MediaUploader",
    getInitialState: function() {
        return { content: null, opened: false }
    },
    close: function() {
        this.state.opened = false
        this.setState({ content: null, opened: this.state.opened })
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    showUploader: function(type){
        this.state.opened = true
        this.setState({opened: this.state.opened, content: React.createElement(FileUploader, {stream: this.props.stream, holder: this.props.holder, type: type, close: this.close})})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    onClick: function(event){
        if(!this.state.content)
            this.setState({content: React.createElement(SelectMediaButtons, {showUploader: this.showUploader})})
        else if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.setState({content: null})
    },
    onInsideClick: function(event){
        event.stopPropagation()
    },
    onOutsideClick: function(){
        if(React.addons.TestUtils.isElementOfType(this.state.content, SelectMediaButtons))
            this.close()
    },
    componentDidMount: function() {
        window.addEventListener('click', this.onOutsideClick);
    },
    componentWillUnmount: function() {
        window.removeEventListener('click', this.onOutsideClick);
    },
    render: function()  {
        return(
            React.createElement("div", {className: "media-uploader " + (!this.state.content ? '' : 'opened'), onClick: this.onInsideClick}, 
                React.createElement("div", {className: "options"}, 
                    this.state.content, 
                    React.createElement("div", {className: "arrow fa fa-caret-down"})
                ), 
                React.createElement("button", {type: "button", onClick: this.onClick, className: "button icon toggle"}, React.createElement("span", {className: "fa fa-paperclip"}))
            )
        )
    }
})

var SelectMediaButtons = React.createClass({displayName: "SelectMediaButtons",
    onClick: function(type){
        var self = this
        return function(e){ self.props.showUploader(type) }
    },
    render: function(){
        return (
            React.createElement("div", {className: "buttons"}, 
                React.createElement("button", {type: "button", onClick: this.onClick('image')}, React.createElement("span", {className: "fa fa-picture-o"}), " Картинку")
            )
        )
    }
})


var Media = React.createClass({displayName: "Media",
    getInitialState: function(){
        return {id: null, file: this.props.file, src: null, status: 'active', fromFile: null, url: null}
    },
    cancel: function(){
        if(this.state.status == 'approved') {
            this.props.holder.state.count -= 1
            this.props.holder.setState({count: this.props.holder.state.count})
        }
        this.state.status = this.state.file ? 'deleted' : 'canceled';
        this.setState({status: this.state.status})
        this.props.stream.onNext({action: 'updateSubmitDisabled'});
    },
    approve: function(){
        this.props.holder.state.count++
        this.props.holder.setState({count: this.props.holder.state.count})
        this.state.status = 'approved'
        this.setState({status: this.state.status})
    },
    onInputFileChange: function(){
        var self = this
        var input = this.refs.fileInput.getDOMNode()
        if (input.files && input.files[0]) {
            var reader = new FileReader();
            reader.onload = function (e) {
                self.setState({src: e.target.result, url: null});
                self.props.stream.onNext({
                    action: 'updatePreview',
                    src: e.target.result,
                    filename: input.value.split('\\').pop()});
            }
            reader.readAsDataURL(input.files[0]);
        }

    },
    onImageLoad: function(e){
        mediaFill(e.target)
    },
    componentDidMount: function(){
        $(window).trigger('resize');
    },
    componentDidUpdate: function(){
       if(this.refs.mediaImage) mediaFill(this.refs.mediaImage.getDOMNode());
    },
    componentWillMount: function(){
        var self = this
        var activeStream = this.props.stream.filter(function(){ return self.state.status == 'active' })
        if(this.state.file) {
            this.state.id = this.state.file.id;
            this.state.url = this.state.file.url;
            this.state.status = 'approved';
        }
        activeStream.filter(function(data){ return data.action == 'selectMediaFile'})
            .subscribe(function(){
                self.refs.fileInput.getDOMNode().click();
            })
        activeStream.filter(function(data){ return data.action == 'selectMediaUrl'})
            .subscribe(function(data){
                self.props.stream.onNext({action: 'updatePreview', src: data.url});
                self.refs.fileInput.getDOMNode().value = ''
                self.setState({src: null, url: data.url})
            })
        activeStream.filter(function(data){ return data.action == 'mediaApprove' })
            .subscribe(function(){
                self.approve()
        })
        activeStream.filter(function(data){ return data.action == 'mediaCancel'})
            .subscribe(function(){
                self.cancel()
        })
    },
    render: function(){
        console.log(this.props.type)
        var src = this.state.url || this.state.src
        var image = !src ? '' : React.createElement("div", {className: "image"}, React.createElement("img", {ref: "mediaImage", src: src, alt: "", onLoad: this.onImageLoad}))
        var url_input = React.createElement("input", {type: "hidden", name: "url", value: this.state.url})
        var type_input = React.createElement("input", {type: "hidden", name: "file.type", value: this.props.type})
        var file_input = React.createElement("input", {ref: "fileInput", type: "file", name: "upload", onChange: this.onInputFileChange})
        if(this.state.status == 'approved') {
            file_input = !this.state.src ? '' : file_input
        }else if(this.state.status == 'deleted') {
            file_input = ''
        }
        if(this.state.status == 'canceled')
            return null
        else {
            var inner = (
                React.createElement("div", null, 
                    React.createElement("button", {type: "button", className: "cancel", onClick: this.cancel}, 
                        React.createElement("span", {className: "fa fa-times"})
                    ), 
                    React.createElement("input", {type: "hidden", name: "file.id", value: this.state.id}), 
                    React.createElement("input", {type: "hidden", name: "file.status", value: this.state.status}), 
                    image, 
                    type_input, 
                    url_input, 
                    file_input
                )
            )

            if(this.state.status == 'approved' || this.state.status == 'active'){
                return React.createElement("div", {className: "media " + this.state.status, style: !src ? {} : {backgroundImage: 'url("'+src+'")'}}, inner)
            }else{
                return React.createElement("span", {className: "media " + this.state.status}, inner)
            }
        }
    }
})

var MediaHolder = React.createClass({displayName: "MediaHolder",
    getDefaultProps: function(){
        return { files: []}
    },
    getInitialState: function(){
        return {media: [], key: 0, count: 0}
    },
    createMedia: function(type, file) {
        this.state.key += 1;
        var media = this.state.media;
        media.push(React.createElement(Media, {holder: this, key: "media_"+this.state.key, type: type, file: file, stream: this.props.stream}))
        this.setState({media: this.state.media, key: this.state.key})
    },

    componentWillMount: function(){
        var self = this
        self.props.files.map(function(file){
            self.createMedia(file.type, file);
            self.state.count++;
        });

        this.props.stream
            .filter(function(data){ return data.action == 'createMedia'})
            .subscribe(function(data){
                self.createMedia(data.type)
        });
        this.props.stream
            .filter(function(data){ return data.action == 'clearMedia'})
            .subscribe(function(){
                if(self.isMounted()) self.setState({media: [], key: 0, count: 0})
        });
    },
    render:function(){
        return(
            React.createElement("div", {className: "media-holder"  + " count-" + this.state.count}, 
                this.state.media.map(function(media){ return media })
            )
        )
    }
})

var FileUploader = React.createClass({displayName: "FileUploader",
    getInitialState: function() {
        return { inputChangeStream: new Rx.Subject(), preview: null, disabled: true }
    },
    onCancel: function(){
        this.props.stream.onNext({action: 'mediaCancel'});
        this.props.close()
    },
    onApprove: function(){
        this.props.stream.onNext({action: 'mediaApprove'});
        this.props.close()
    },
    onUploadClick: function(){
        this.setState({'disabled': true})
        this.props.stream.onNext({action: 'selectMediaFile'});
    },
    onUrlChange: function(e){
        this.setState({'disabled': true})
        this.state.inputChangeStream.onNext(e.target.value)
    },
    urlChangeHandler: function(url){
        this.props.stream.onNext({action: 'selectMediaUrl', url: url});
    },
    onImageLoad: function(){
        this.setState({'disabled': false})
    },
    getTitle: function() {
        var title = 'Загрузка';
        switch(this.props.type) {
            case 'image': title += ' картинки';break;
            case 'video': title += ' видео';break;
            case 'audio': title += ' аудио';break;
        }
        return title
    },
    updatePreview: function(data){
        this.setState({preview: data.src })
        this.refs.urlField.getDOMNode().value = data.filename || data.src
    },

    componentDidMount: function(){
        var self = this
        this.state.inputChangeStream.debounce(500).subscribe(this.urlChangeHandler)
        this.props.stream.onNext({action: 'createMedia', type: this.props.type});
        this.props.stream
            .filter(function(data){ return data.action == 'updatePreview' && self.isMounted()})
            .subscribe(self.updatePreview)
    },

    render: function() {
        var preview = !this.state.preview ? '' : React.createElement("div", {className: "wrapper"}, React.createElement("img", {src: this.state.preview, onLoad: this.onImageLoad, alt: ""}));
        var uploadButton = this.props.type == 'image' ? React.createElement("button", {type: "button", onClick: this.onUploadClick, className: "button download"}, React.createElement("span", {className: "fa fa-download"})) : null;
        return (
            React.createElement("div", {className: "file-uploader"}, 
                React.createElement("h3", {className: "title"}, this.getTitle()), 
                React.createElement("div", {className: "preview"}, preview), 
                React.createElement("div", {className: "url-wrapper"}, 
                    React.createElement("input", {type: "text", ref: "urlField", name: "url", placeholder: "Введите адрес", onChange: this.onUrlChange}), 
                    uploadButton
                ), 
                React.createElement("div", {className: "buttons"}, 
                    React.createElement("button", {type: "button", disabled: this.state.disabled, className: "button", onClick: this.onApprove}, "Добавить"), 
                    React.createElement("button", {type: "button", onClick: this.onCancel, className: "button cancel"}, "Отмена")
                )
            )
        )
    }
})
var popupStream = new Rx.Subject()

var PopupHolder = React.createClass({displayName: "PopupHolder",
    getInitialState: function(){
        return { popups: [], counter: 0}
    },
    componentDidMount: function(){
        var self = this
        popupStream.filter(function(data){ return data.action == 'show' }).subscribe(function(data){
            var id = self.state.counter++;
            self.state.popups.push(React.createElement(Popup, React.__spread({key: 'popup_'+id, id: id},  data.data)))
            self.setState({popups: self.state.popups});
        });
        popupStream.filter(function(data){ return data.action == 'close' }).subscribe(function(data){
            for(var i in self.state.popups)
                if(self.state.popups[i].props.id == data.popup.props.id)break;

            delete self.state.popups[i]
            self.setState({popups: self.state.popups});
        });
    },
    render: function(){
        return(
            React.createElement("div", null, " ", this.state.popups.map(function(popup){return popup}), " ")
        )
    }
})

var Popup = React.createClass({displayName: "Popup",
    statics: {
        show: function(data) {
            popupStream.onNext({action: 'show', data: data})
        }
    },
    getDefaultProps: function(){
        return {
            flash: false,
            closeButton: true,
            title: '',
            buttons: [],
            outsideClickClose: false
        }
    },
    onClose: function(){
        popupStream.onNext({action: 'close', popup: this})
    },
    closeButton: function(){
        if(!this.props.closeButton) return null;
        return React.createElement("button", {className: "close", onClick: this.onClose})
    },
    title: function(){
        return !this.props.title ? '' : React.createElement("h3", {className: "title"}, this.props.title)
    },
    buttons: function() {
        var self = this
        var buttons = this.props.buttons.map(function(button,i){
            var action = ( typeof button.action == 'function' ) ? function(){ button.action(self) } : null;
            return React.createElement("button", {key: 'popup_button_'+self.props.id+'_'+i, className: 'button '+button.className, onClick: action}, button.name)
        });
        if(!!buttons) buttons = React.createElement("div", {className: "buttons"}, buttons)
        return buttons
    },

    render: function(){
        var wrapperClass = 'popup-wrapper' + (this.props.hidden ? ' hidden' : '');
        var windowClass = 'popup-window' +
            (this.props.closeButton ? ' has-close-button' : '') +
            (!this.props.title ? ' no-title' : '');
        return (
            React.createElement("table", {className: wrapperClass}, 
                React.createElement("tr", null, 
                    React.createElement("td", null, 
                        React.createElement("div", {className: windowClass}, 
                            this.closeButton(), 
                            this.title(), 
                            React.createElement("div", {className: "content"}, this.props.content), 
                            this.buttons()
                        )
                    )
                )
            )
        )
    }
})
$(document).ready(function(){
    React.render( React.createElement(PopupHolder, null), document.getElementById('popup'));
});
var UserIcon = React.createClass({displayName: "UserIcon",
    render: function() {
        var user = this.props.user
        var photo = !!user.photo_s ? {'backgroundImage': "url("+user.photo_s+")"} : {}

        function goto_profile(){
            window.location.href='/user/profile/'+ user.id
        }
        return(
           React.createElement("div", {className: "user-icon", onClick: goto_profile, style: photo, title: user.full_name})
        )
    }
})
var LikesCounter = React.createClass({displayName: "LikesCounter",
    getInitialState: function() {
        return {stream: new Rx.Subject(), processing: false, count: this.props.count || 0, active: !!this.props.my, my: this.props.my || false, hover: false}
    },
    onClick: function(){
        this.state.stream.onNext({action: 'click'})
    },
    componentWillMount: function(){
        var self = this;
        this.state.stream.filter(function(data){return data.action == 'click'}).debounce(300).subscribe(function(data){
            $.post('/vote/like', {entity: self.props.entity, entity_id: self.props.entity_id, value: !self.state.active}, "json")
                .done(function(res){
                    if(res.status == 'ok'){
                        self.setState({active: res.vote.value != '0', count: res.count});
                    }
                }).error(function(){ self.state.processing = false })
        });
    },
    render: function() {
        return(
            React.createElement("div", {className: "likes-counter " + (this.state.active ? "active" : ""), onClick: this.onClick}, 
                React.createElement("span", {className: "fa icon"}), 
                React.createElement("span", null, this.state.count)
            )
        )
    }
});


$(document).ready(function(){
    $('.likes-counter-component').each(function(){
        var entity = $(this).attr('data-entity');
        var entity_id = $(this).attr('data-entity-id');
        var count = parseInt($(this).attr('data-count')) || 0;
        var my = Boolean($(this).attr('data-my-vote') == '1');
        React.render( React.createElement(LikesCounter, {entity: entity, entity_id: entity_id, count: count, my: my}), $(this)[0]);
    });
});