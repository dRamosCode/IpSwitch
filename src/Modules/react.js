"use strict";

let domContainer;
let root;
let bg = ReactDOM.createRoot(document.querySelector("#backgroundModal"));
let newItem = ReactDOM.createRoot(document.querySelector("#newItemModal"));
let itemList = ReactDOM.createRoot(document.querySelector("#itemList"));
let modalMessage = ReactDOM.createRoot(document.querySelector("#modalMessage"));
let adapters = [];
let originalItem;
let pendingNetworkRequest = null;

const nullItem = {
  DHCP: "false",
  adapter: "",
  gateway: "",
  ipAddress: "",
  name: "",
  subnet: "",
};

window.electron.receiveRights((evt, arg) => {
  if (arg === false) {
    showMessage(
      JSON.stringify({ type: "fatal", message: "Administrator privileges required", details: "Run the application as Administrator" }),
      "alarm"
    );
  }
});

window.electron.requestAdapters();
window.electron.receiveAdapters((evt, arg) => {
  adapters = arg;
});

function parseErrorResponse(data) {
  try {
    const parsed = JSON.parse(data);
    if (parsed.type && parsed.message) {
      return {
        type: parsed.type,
        message: parsed.message,
        details: parsed.details || "",
      };
    }
  } catch (e) {
    // Not JSON, treat as success message
  }
  return {
    type: "success",
    message: data,
    details: "",
  };
}

function getMessageColor(type) {
  switch (type) {
    case "fatal":
      return "alarm";
    case "recoverable":
      return "warning";
    case "warning":
      return "warning";
    case "success":
    default:
      return "success";
  }
}

function activateNetwork(data) {
  if (pendingNetworkRequest) {
    window.electron.checkNetwork((evt, arg) => {});
    pendingNetworkRequest = null;
  }

  window.electron.changeNetwork(data);
  showMessage("Loading...", "warning");

  pendingNetworkRequest = window.electron.checkNetwork((evt, arg) => {
    pendingNetworkRequest = null;
    checkNetworkChange(arg);
  });
}

function checkNetworkChange(result) {
  const errorInfo = parseErrorResponse(result);
  
  if (errorInfo.type === "success") {
    showMessage(
      JSON.stringify({ type: "success", message: "Network adapter changed successfully", details: "" }),
      "success"
    );
    setTimeout(hideMessage, 1500);
  } else if (errorInfo.type === "warning") {
    showMessage(
      JSON.stringify({ type: "warning", message: errorInfo.message, details: errorInfo.details }),
      "warning"
    );
    setTimeout(hideMessage, 4000);
  } else {
    showMessage(
      JSON.stringify({ type: "fatal", message: errorInfo.message, details: errorInfo.details }),
      "alarm"
    );
    setTimeout(hideMessage, 5000);
  }
}

function checkChange(data) {
  window.electron.requestAdapterInfo(data.adapter);
  window.electron.receiveAdapterInfo((evt, arg) => {
    if (arg.error) {
      showMessage(
        JSON.stringify({ type: "fatal", message: "Unable to verify configuration", details: arg.error }),
        "alarm"
      );
      setTimeout(hideMessage, 3000);
      return;
    }

    const success =
      (arg.dhcp === true && (data.DHCP === true || data.DHCP === "true")) ||
      (arg.ip === data.ipAddress &&
        (arg.subnet === data.subnet || arg.subnet === undefined) &&
        (arg.gateway === data.gateway || arg.gateway === undefined));

    if (success) {
      showMessage(
        JSON.stringify({ type: "success", message: "Network adapter changed successfully", details: "" }),
        "success"
      );
      setTimeout(hideMessage, 1500);
    } else {
      showMessage(
        JSON.stringify({ type: "fatal", message: "Configuration verification failed", details: "The adapter settings do not match the requested configuration" }),
        "alarm"
      );
      setTimeout(hideMessage, 3000);
    }
  });
}

function showMessage(msg, type) {
  bg.render(<ModalBackground visible="true" />);
  modalMessage.render(<ModalMessage message={msg} color={type} />);
}

function hideMessage() {
  bg.render(<ModalBackground visible="false" />);
  modalMessage.render(<ModalMessage message={"hide"} color={""} />);
}

function hideMessageOnTop() {
  modalMessage.render(<ModalMessage message={"hide"} color={""} />);
}

function showConfirmation(data, msg, button1, button2) {
  bg.render(<ModalBackground visible="true" />);
  modalMessage.render(<ModalConfirmation element={data} message={msg} btn1={button1} btn2={button2} />);
}

function hideConfirmation() {
  bg.render(<ModalBackground visible="false" />);
  modalMessage.render(<ModalConfirmation message={"hide"} />);
}

function showModal() {
  bg.render(<ModalBackground visible="true" />);
  newItem.render(<ModalContainer visible="true" data={nullItem} edit={""} key={Math.random.toString()} />);
}

function cancelModal() {
  bg.render(<ModalBackground visible="false" />);
  newItem.render(<ModalContainer visible="false" data={nullItem} edit={""} />);
}

function showModalEdit(item) {
  originalItem = item;
  bg.render(<ModalBackground visible="true" />);
  newItem.render(<ModalContainer visible="true" data={item} edit={"true"} />);
}

function cancelModalEdit() {
  bg.render(<ModalBackground visible="false" />);
  newItem.render(<ModalContainer visible="false" data={nullItem} edit={""} />);
}

function saveModal(data) {
  window.electron.saveJSON(data);

  bg.render(<ModalBackground visible="false" />);
  newItem.render(<ModalContainer visible="false" data={nullItem} edit={""} />);

  window.electron.requestData();
  window.electron.receiveData((evt, arg) => {
    updateData(arg);
  });

  showMessage(
    JSON.stringify({ type: "success", message: "Configuration saved successfully", details: "" }),
    "success"
  );
  setTimeout(hideMessage, 2000);
}

function saveEditionModal(data) {
  window.electron.requestData();
  window.electron.receiveData((evt, arg) => {
    for (let i = 0; i < arg.length; i++) {
      if (originalItem.name === arg[i].name) {
        arg[i] = data;
      }
    }
    window.electron.overwriteJSON(arg);
    updateData(arg);

    bg.render(<ModalBackground visible="false" />);
    newItem.render(<ModalContainer visible="false" data={nullItem} edit={""} />);

    showMessage(
      JSON.stringify({ type: "success", message: "Configuration saved successfully", details: "" }),
      "success"
    );
    setTimeout(hideMessage, 2000);
  });
}

function deleteElement(element) {
  modalMessage.render(<ModalConfirmation message={"hide"} />);

  let newData = [];

  window.electron.requestData();
  window.electron.receiveData((evt, arg) => {
    newData = arg;

    let index = newData.findIndex((item) => item.name === element.name);

    if (index >= 0) {
      newData.splice(index, 1);
      window.electron.overwriteJSON(newData);
      updateData(newData);
      showMessage(
        JSON.stringify({ type: "success", message: "Configuration deleted", details: "" }),
        "success"
      );
      setTimeout(hideMessage, 2000);
    }
  });
}

window.electron.requestData();
window.electron.receiveData((evt, arg) => {
  updateData(arg);
});

function updateData(data) {
  itemList.render(<ItemTable items={data} />);
}

function updateSearch(search) {
  let newList = [];

  window.electron.requestData();
  window.electron.receiveData((evt, arg) => {
    for (const item of arg) {
      if (item.name.toLowerCase().includes(search.toLowerCase())) {
        newList.push(item);
      }
    }
    updateData(newList);
  });
}

$(".newItem").click(showModal);