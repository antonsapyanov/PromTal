var FieldError = React.createClass({
    render: function() {
        if(!this.props.text)
            return false
        else
            return(
                <div className="error-wrapper"><div className="error">{this.props.text}</div></div>
            )
    }
})

var Input = React.createClass({
    getInitialState: function() {
        this.props.registerField(this)
        return {error: ''};
    },
    onChange: function(onChnageFunc) {
        var self = this
        function _onChange() {
            self.setState({error: ''})
            if(typeof onChnageFunc == 'function')
                onChnageFunc(self)
        }
        return _onChange
    },
    render: function() {
        var error = !this.state.error ? '' : <FieldError text={this.state.error}/>
        return(
            <div className="field-wrapper">
                <input {...this.props} onChange={this.onChange(this.props.onChange)}/>{error}
            </div>
        )
    }
});

var TextArea = React.createClass({
    getInitialState: function() {
        this.props.registerField(this)
        return {error: ''};
    },
    onChange: function(onChnageFunc) {
        var self = this
        function _onChange() {
            self.setState({error: ''})
            if(typeof onChnageFunc == 'function')
                onChnageFunc(self)
        }
        return _onChange
    },
    render: function() {
        var error = !this.state.error ? '' : <FieldError text={this.state.error}/>
        return(
            <div className="field-wrapper">
                <textarea {...this.props} onChange={this.onChange(this.props.onChange)}>{this.props.children}</textarea>{error}
            </div>
        )
    }
});

var AJAXForm = React.createClass({
    fields: {},
    getInitialState: function() {
        return {errors: {}, data: {}};
    },
    registerField: function(name, index) {
        var self = this
        function _registerField(field) {
            if(!!name) {
                self.fields[name] = self.fields[name] || {}
                self.fields[name][index] = field
            }
        }
        return _registerField
    },
    showErrors: function(errors) {
        for(var name in errors)
            for(var i in errors[name])
                this.fields[name][i].setState({error: errors[name][i][0].message})
    },
    onSubmit: function(e) {
        e.preventDefault();
        var self = this
        var form = $(e.target)

        $.ajax({
            type: form.attr('method') || 'POST',
            url: form.attr('action') || '',
            data: form.serialize(),

            success: function(json) {
                self.showErrors(json.errors)
                if(json.status == 'ok'){
                    if(typeof self.props.onSuccess == 'function')
                        self.props.onSuccess(json)
                }

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
            var clone = React.addons.cloneWithProps(child, {registerField: self.registerField(name, index)});

            if(!!clone.props.children)
                clone.props.children = self.childrenWithErrors(root, clone)
            return clone
        });
    },
    render: function() {
        this.children = this.childrenWithErrors(this)
        return(
            <form {...this.props} onSubmit={this.onSubmit}>{this.children}</form>
        )
    }
});

