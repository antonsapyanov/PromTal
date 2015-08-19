var FieldError = React.createClass({
    getInitialState: function() {
        this.props.registerError(this);
        return {text: ''}
    },
    render: function() {
        if(!this.state.text)
            return false
        else
            return(
               <div className='error-wrapper'><div className="error">{this.state.text}</div></div>
            )
    }
})

var Input = React.createClass({
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            <div className="field-wrapper">
                <input {...this.props} onChange={this.onChange}/>
                <FieldError ref='error' registerError={this.props.registerError}/>
            </div>
        )
    }
});

var Select = React.createClass({
    onChange: function(event) {
        this.refs.error.setState({text: ''})
        if(typeof this.props.onChange == 'function')
            this.props.onChange(event)
    },
    render: function() {
        return(
            <div className="field-wrapper">
                <select {...this.props} onChange={this.onChange}>{this.props.children}</select>
                <FieldError ref='error' registerError={this.props.registerError}/>
            </div>
        )
    }
});

var TextArea = React.createClass({
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
            <div className="field-wrapper">
                <textarea ref='textarea' {...this.props} onChange={this.onChange}>{this.props.children}</textarea>
                <FieldError ref='error' registerError={this.props.registerError}/>
            </div>
        )
    }
});

var ImageLoader = React.createClass({
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
            <div className="field-wrapper">
                <div className="image-loader" >
                    <input onChange={this.onChange} type="file" ref="image" name={this.props.name || 'image'}/>
                    <div className="image-preview" style={preview}></div>
                </div>
                <FieldError ref='error' registerError={this.props.registerError}/>
            </div>
        )
    }
});

var AJAXForm = React.createClass({
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
            <form {...this.props} onSubmit={this.onSubmit}>{this.children}</form>
        )
    }
});

var ManageUsers = React.createClass({

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
            <div>
                <div className="input-group fio">
                  <span className="input-group-addon" id="basic-addon1"><i className="fa fa-user-plus"></i></span>
                  <input type="text" className="form-control" value={this.state.userName} onChange={this.userNameChange} placeholder="Фамилия или имя" aria-describedby="basic-addon1" />
                </div>
                <ul className="media-list">
                {users.map(function(user) {
                  return <UserInSearch userIn={user} dep_id={self.props.dep_id} />;
                })}
                </ul>
            </div>
        );

    }
});

var UserInSearch = React.createClass({
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
              <li className="media btn btn-default user-in-search" onClick={self.clickedUser}>
                <div className="media-left">
                    <img src={user.src_foto} className="media-object foto-small" />
                </div>
                <div className="media-body">
                  <h4 className="media-heading">{user.full_name}</h4>
                  {user.dep_name}
                </div>
              </li>
        );
    }
});


var TagField = React.createClass({
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
            <div className="tag-field" onClick={this.focusInput}>
                {this.state.tags.map(function(tag, i) {
                    return <Tag value={tag} key={"tag_"+i} name={self.props.name || 'tag'}/>
                })}
                <div className="value-wrapper">
                    <span>{this.state.value}</span>
                    <input ref="input" type="text" value={this.state.value} onKeyPress={this.onKeyPress} onKeyDown={this.onKeyDown} onChange={this.onChange}/>
                </div>
            </div>
        )
    }
});

var Tag = React.createClass({
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
                <div className="tag" onClick={this.onClick}>
                    <input type="hidden" name={this.props.name} value={this.props.value.trim()}/>
                    <span className="fa fa-tag"></span>
                    {this.props.value}
                    <span className="fa fa-times delete" onClick={this.onDelete}></span>
                </div>
            )
    }
})