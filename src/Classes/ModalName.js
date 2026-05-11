class ModalName extends React.Component {
	constructor(props) {
		super(props);
		this.handleChange = this.handleChange.bind(this);
		this.state = {
			value: "",
			restored: false,
		};
	}

	//Functions
	handleChange(event) {
		this.setState({ value: event.target.value });
		this.props.setName(event.target.value);
	}

	componentDidMount() {
		if (this.props.edit != "" && this.state.value == "") {
			this.state.value = this.props.data.name;
		}
		this.props.setName(this.state.value);
		this.setState({ restored: true });
	}

	render() {
		// Empty field
		if (this.state.value == "") {
			return (
				<input
					className="name empty"
					type="text"
					placeholder="Name..."
					maxLength="50"
					value={this.state.value}
					onChange={this.handleChange}
				/>
			);
		}
		// Field with data
		else {
			return (
				<input
					className="name"
					type="text"
					placeholder="Name..."
					maxLength="50"
					value={this.state.value}
					onChange={this.handleChange}
				/>
			);
		}
	}
}
