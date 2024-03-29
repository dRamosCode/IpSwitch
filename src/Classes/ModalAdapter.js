class ModalAdapter extends React.Component {
	constructor(props) {
		super(props);
		this.handleChange = this.handleChange.bind(this);
		this.state = {
			value: "",
		};
	}

	//Functions
	handleChange(event) {
		this.setState({ value: event.target.value });
		this.props.setAdapter(event.target.value);
	}

	componentDidMount() {
		this.props.setAdapter(this.state.value);
	}

	render() {
		// Edition field
		if (this.props.edit != "" && this.state.value == "") {
			this.state.value = this.props.data.adapter;
		}
		if (this.state.value == "") {
			return (
				<select className="adapter empty" name="adapters" value={this.state.value} onChange={this.handleChange}>
					<option value="" disabled hidden></option>
					{this.props.adapterList.map((element, index) => (
						<option value={this.props.adapterList[index]} key={index}>
							{this.props.adapterList[index]}
						</option>
					))}
				</select>
			);
		} else {
			return (
				<select className="adapter" name="adapters" value={this.state.value} onChange={this.handleChange}>
					<option value="" disabled hidden></option>
					{this.props.adapterList.map((element, index) => (
						<option value={this.props.adapterList[index]} key={index}>
							{this.props.adapterList[index]}
						</option>
					))}
				</select>
			);
		}
	}
}
