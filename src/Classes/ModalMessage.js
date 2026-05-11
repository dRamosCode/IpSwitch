class ModalMessage extends React.Component {
  getIcon(type) {
    switch (type) {
      case "fatal":
        return "\u2717";
      case "recoverable":
        return "\u21BA";
      case "warning":
        return "\u26A0";
      case "success":
      default:
        return "\u2713";
    }
  }

  getMessageClass(type) {
    const baseClass = `modalMessage shadow ${this.props.color || ""}`;
    if (type === "fatal") return `${baseClass} error-fatal`;
    if (type === "recoverable") return `${baseClass} error-recoverable`;
    if (type === "warning") return `${baseClass} error-warning`;
    return `${baseClass} error-success`;
  }

  render() {
    if (this.props.message === "hide") {
      return null;
    }

    const isJsonMessage = this.props.message.startsWith("{");
    let type = "success";
    let message = this.props.message;
    let details = "";

    if (isJsonMessage) {
      try {
        const data = JSON.parse(this.props.message);
        type = data.type || "success";
        message = data.message || this.props.message;
        details = data.details || "";
      } catch (e) {
        type = "warning";
      }
    } else {
      type = this.props.color || "success";
    }

    const icon = this.getIcon(type);

    return (
      <div className={this.getMessageClass(type)}>
        <div className="messageContent">
          <span className={`messageIcon icon-${type}`}>{icon}</span>
          <span className="messageText">{message}</span>
        </div>
        {details && <div className="messageDetails">{details}</div>}
      </div>
    );
  }
}