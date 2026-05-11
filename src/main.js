"use strict";

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { exec } = require("node:child_process");
const { execFile } = require("child_process");
const PowerShell = require("powershell");
var jetpack = require("fs-jetpack");
var network = require("network");

let mainWindow;
let adapters = [];
let userRights;

// Error types
const ErrorType = {
  FATAL: "fatal",
  RECOVERABLE: "recoverable",
  WARNING: "warning",
  SUCCESS: "success",
};

// Force close app during app installation
if (require("electron-squirrel-startup")) app.quit();

// Create new window
const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    minWidth: 800,
    minHeight: 250,
    frame: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, "Styles\\Images\\Icons\\ipswitch.ico"),
    webPreferences: {
      preload: path.join(__dirname, "Modules\\preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "HTML\\index.html"));
};

// Render window
app.whenReady().then(() => {
  createWindow();
});

// Check Admin rights
exec("NET SESSION", function (err, so, se) {
  userRights = se.length === 0 ? true : false;
});

// Get network adapters
function refreshAdapters() {
  adapters = [];
  exec("cmd /c chcp 65001>nul && netsh interface ipv4 show addresses", (error, stdout, stderr) => {
    if (error || stderr) return;
    
    let index = 0;
    let lastIndex = 0;
    let indexes = [];

    while (index < stdout.length) {
      lastIndex = stdout.indexOf('"', index);
      indexes.push(lastIndex + 1);
      index = lastIndex + 1;
      if (lastIndex == -1) {
        break;
      }
    }

    for (let i = 0; i < indexes.length - 1; i = i + 2) {
      let substring = stdout.substring(indexes[i], indexes[i + 1] - 1);
      if (substring.trim()) {
        adapters.push(substring);
      }
    }
  });
}
refreshAdapters();

// Validation helpers
function isValidIP(ip) {
  if (!ip || typeof ip !== "string") return false;
  const parts = ip.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255 && part === String(num);
  });
}

function isValidSubnet(subnet) {
  if (!isValidIP(subnet)) return false;
  const parts = subnet.split(".").map(Number);
  let binary = "";
  for (const p of parts) {
    binary += p.toString(2).padStart(8, "0");
  }
  const ones = binary.indexOf("01");
  return ones === -1;
}

function formatError(type, message, details = "") {
  return JSON.stringify({ type, message, details });
}

function parseError(errorString) {
  if (!errorString) return { type: ErrorType.FATAL, message: "Unknown error" };
  
  const lowerError = errorString.toLowerCase();
  
  if (lowerError.includes("access is denied") || lowerError.includes("administrator")) {
    return { type: ErrorType.FATAL, message: "Administrator privileges required", details: "Run the application as Administrator" };
  }
  if (lowerError.includes("no msft_netipaddress") || lowerError.includes("not found") && lowerError.includes("interface")) {
    return { type: ErrorType.RECOVERABLE, message: "Network adapter not found", details: errorString.split("\n")[0].trim() };
  }
  if (lowerError.includes("disconnected")) {
    return { type: ErrorType.FATAL, message: "Adapter disconnected", details: "Connect the adapter and try again" };
  }
  if (lowerError.includes("already exists") || lowerError.includes("conflict")) {
    return { type: ErrorType.RECOVERABLE, message: "IP address already in use", details: "Choose a different IP address" };
  }
  if (lowerError.includes("parameter") || lowerError.includes("invalid")) {
    return { type: ErrorType.FATAL, message: "Invalid network configuration", details: errorString.split("\n")[0].trim() };
  }
  
  return { type: ErrorType.WARNING, message: "Configuration failed", details: errorString.split("\n")[0].trim() };
}

//----Inter Process Comunication----

// Request user rights
ipcMain.on("requestRights", (evt, arg) => {
  mainWindow.webContents.send("sendRights", userRights);
});

// Close app
ipcMain.on("close", (evt, arg) => {
  app.quit();
});

// Maximize app
ipcMain.on("maximize", (evt, arg) => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

// Minimize app
ipcMain.on("minimize", (evt, arg) => {
  mainWindow.minimize();
});

// Refresh adapters
ipcMain.on("refreshAdapters", (evt, arg) => {
  refreshAdapters();
  setTimeout(() => {
    mainWindow.webContents.send("sendAdapters", adapters);
  }, 500);
});

// Save JSON file (write data)
ipcMain.on("saveJSON", (evt, arg) => {
  let data = [];

  if (jetpack.exists(path.join(__dirname, "Data\\data.json")) == "file") {
    data = jetpack.read(path.join(__dirname, "Data\\data.json"), "json");
  }
  data.push(arg);
  jetpack.write(path.join(__dirname, "Data\\data.json"), data);
});

// Overwrite JSON file (write data)
ipcMain.on("overwriteJSON", (evt, arg) => {
  jetpack.write(path.join(__dirname, "Data\\data.json"), arg);
});

// Read JSON file (update data)
ipcMain.on("requestData", (evt, arg) => {
  if (jetpack.exists(path.join(__dirname, "Data\\data.json"), "json") == "file") {
    let data = jetpack.read(path.join(__dirname, "Data\\data.json"), "json");
    mainWindow.webContents.send("updateData", data);
  }
});

// Send adapter list to renderer
ipcMain.on("requestAdapters", (evt, arg) => {
  mainWindow.webContents.send("sendAdapters", adapters);
});

// Change active network
ipcMain.on("changeNetwork", (evt, arg) => {
  // Validate inputs first
  if (!adapters.includes(arg.adapter)) {
    const err = formatError(ErrorType.FATAL, "Unknown adapter", `Adapter "${arg.adapter}" not found. Available: ${adapters.join(", ") || "none"}`);
    mainWindow.webContents.send("sendNetwork", err);
    return;
  }

  if (!userRights) {
    const err = formatError(ErrorType.FATAL, "Administrator privileges required", "Run the application as Administrator");
    mainWindow.webContents.send("sendNetwork", err);
    return;
  }

  // Validate IP if static
  if (arg.DHCP === false || arg.DHCP === "false") {
    if (!isValidIP(arg.ipAddress)) {
      const err = formatError(ErrorType.FATAL, "Invalid IP address", `Enter a valid IPv4 address (e.g., 192.168.1.50)`);
      mainWindow.webContents.send("sendNetwork", err);
      return;
    }
    if (!isValidSubnet(arg.subnet)) {
      const err = formatError(ErrorType.FATAL, "Invalid subnet mask", `Enter a valid subnet mask (e.g., 255.255.255.0)`);
      mainWindow.webContents.send("sendNetwork", err);
      return;
    }
    if (arg.gateway && arg.gateway !== "0.0.0.0" && !isValidIP(arg.gateway)) {
      const err = formatError(ErrorType.FATAL, "Invalid gateway address", `Enter a valid IPv4 address or leave as 0.0.0.0`);
      mainWindow.webContents.send("sendNetwork", err);
      return;
    }
  }

  // Read the adapter info and convert to object
  let ps = new PowerShell(
    `Get-NetIPConfiguration -InterfaceAlias "${arg.adapter}" | 
   Select-Object InterfaceAlias, InterfaceIndex,InterfaceDescription, 
   @{Name="Status";Expression={$_.NetAdapter.Status}} | 
   ConvertTo-Json`
  );

  ps.on("error", (err) => {
    const parsed = parseError(err.message);
    mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
  });

  ps.on("output", (data) => {
    if (!data) return;
    try {
      const dataObject = JSON.parse(data);

      if (dataObject.Status == "Disconnected") {
        const err = formatError(ErrorType.FATAL, "Adapter disconnected", "Connect the network cable and try again");
        mainWindow.webContents.send("sendNetwork", err);
        return;
      }

      if (arg.DHCP === false || arg.DHCP === "false") {
        // Calculate prefix length from subnet
        let prefix = arg.subnet
          .split(".")
          .map((octet) => Number(octet).toString(2))
          .map((bin) => bin.replace(/0/g, "").length)
          .reduce((a, b) => a + b, 0);

        const gatewayParam = arg.gateway && arg.gateway !== "0.0.0.0" ? `-DefaultGateway ${arg.gateway}` : "";

        let ps = new PowerShell(
          `Remove-NetIPAddress -InterfaceAlias "${arg.adapter}" -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
          Remove-NetRoute -InterfaceAlias "${arg.adapter}" -Confirm:$false -ErrorAction SilentlyContinue
          Set-NetIPInterface -InterfaceAlias "${arg.adapter}" -Dhcp Disabled
          New-NetIPAddress -InterfaceAlias "${arg.adapter}" -IPAddress ${arg.ipAddress} -PrefixLength ${prefix} ${gatewayParam}
          $result = Get-NetIPAddress -InterfaceAlias "${arg.adapter}" -AddressFamily IPv4 | Where-Object { $_.IPAddress -eq "${arg.ipAddress}" }
          if ($result) { "SUCCESS" } else { "FAILED" }`
        );

        ps.on("error", (err) => {
          const parsed = parseError(err.message);
          mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
        });

        ps.on("output", (output) => {
          if (!output) return;
          if (output.trim().includes("SUCCESS")) {
            const success = formatError(ErrorType.SUCCESS, "Network configuration applied successfully", "");
            mainWindow.webContents.send("sendNetwork", success);
          } else {
            const err = formatError(ErrorType.WARNING, "Configuration may not have applied correctly", "Please verify the network settings");
            mainWindow.webContents.send("sendNetwork", err);
          }
        });

        ps.on("error-output", (data) => {
          const parsed = parseError(data);
          mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
        });
      } else {
        // Set DHCP IP address
        let ps = new PowerShell(
          `Remove-NetRoute -InterfaceAlias "${arg.adapter}" -Confirm:$false -ErrorAction SilentlyContinue
          Set-NetIPInterface -InterfaceAlias "${arg.adapter}" -DHCP Enabled
          Set-DnsClientServerAddress -InterfaceAlias "${arg.adapter}" -ResetServerAddresses
          $dhcp = (Get-NetIPInterface -InterfaceAlias "${arg.adapter}" -AddressFamily IPv4).Dhcp
          if ($dhcp -eq "Enabled") { "SUCCESS" } else { "FAILED" }`
        );

        ps.on("error", (err) => {
          const parsed = parseError(err.message);
          mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
        });

        ps.on("output", (output) => {
          if (!output) return;
          if (output.trim().includes("SUCCESS")) {
            const success = formatError(ErrorType.SUCCESS, "Network configuration applied successfully", "");
            mainWindow.webContents.send("sendNetwork", success);
          } else {
            const err = formatError(ErrorType.WARNING, "Configuration may not have applied correctly", "Please verify the network settings");
            mainWindow.webContents.send("sendNetwork", err);
          }
        });

        ps.on("error-output", (data) => {
          const parsed = parseError(data);
          mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
        });
      }
    } catch (e) {
      const err = formatError(ErrorType.WARNING, "Failed to parse adapter info", e.message);
      mainWindow.webContents.send("sendNetwork", err);
    }
  });

  ps.on("error-output", (data) => {
    const parsed = parseError(data);
    mainWindow.webContents.send("sendNetwork", formatError(parsed.type, parsed.message, parsed.details));
  });
});

// Get network adapter info
ipcMain.on("requestAdapterInfo", (evt, arg) => {
  let info = {
    dhcp: false,
    ip: "",
    subnet: "",
    gateway: "",
    error: null,
  };

  if (!adapters.includes(arg)) {
    info.error = "Adapter not found";
    mainWindow.webContents.send("sendAdapterInfo", info);
    return;
  }

  network.get_interfaces_list(function (err, list) {
    if (err) {
      info.error = err.message;
      mainWindow.webContents.send("sendAdapterInfo", info);
      return;
    }

    for (let i = 0; i < list.length; i++) {
      if (list[i].name == arg) {
        info.ip = list[i].ip_address || "";
        info.subnet = list[i].netmask || "";
        info.gateway = list[i].gateway_ip || "";
      }
    }

    exec("cmd /c chcp 65001>nul && netsh interface ipv4 show addresses \"" + arg + "\" | findstr DHCP", (error, stdout, stderr) => {
      if (!error && stdout) {
        let index = stdout.indexOf(":") + 1;
        for (let i = index; i < stdout.length; i++) {
          if (stdout[i] != " " && (stdout[i] == "S" || stdout[i] == "Y")) {
            info.dhcp = true;
          }
        }
      }
      mainWindow.webContents.send("sendAdapterInfo", info);
    });
  });
});