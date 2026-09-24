const { React } = window.boomi.flow;

const COLUMNS = [
  { key: "serviceOrderEnd", label: "Service Order End" },
  { key: "accessType", label: "Access Type" },
  { key: "inniType", label: "INNI Type" },
  { key: "topologyType", label: "Topology Type" },
  { key: "deviceA", label: "Device A" },
  { key: "interfaceA", label: "Interface A" },
  { key: "commentA", label: "Comment A" },
  { key: "deviceB", label: "Device B" },
  { key: "interfaceB", label: "Interface B" },
  { key: "commentB", label: "Comment B" },
];

const BLANK_ROW = {
  serviceOrderEnd: "", accessType: "", inniType: "", topologyType: "",
  deviceA: "", interfaceA: "", commentA: "",
  deviceB: "", interfaceB: "", commentB: "",
};

// Shared, synchronous, in-page state — independent from access-form-widget's
// window.__accessFormBridge (different flow, different component, kept isolated).
if (!window.__selectionGridBridge) {
  window.__selectionGridBridge = { allEntries: [] };
}

function injectStyles() {
  if (document.getElementById("selection-grid-table-styles")) return;
  var style = document.createElement("style");
  style.id = "selection-grid-table-styles";
  style.textContent =
    ".sgt-wrapper{margin-top:8px;overflow-x:auto;}" +
    ".sgt-table{border-collapse:collapse;width:100%;}" +
    ".sgt-table th,.sgt-table td{border:1px solid #ccc;padding:6px 8px;text-align:left;font-size:13px;}" +
    ".sgt-table th{background:#f5f5f5;}" +
    ".sgt-entry-row td{background:#eef6ff;}" +
    ".sgt-select,.sgt-input{padding:5px;width:100%;min-width:110px;box-sizing:border-box;}" +
    ".sgt-add-btn{padding:5px 14px;cursor:pointer;}" +
    ".sgt-delete-btn{padding:4px 10px;cursor:pointer;}";
  document.head.appendChild(style);
}

function readBridgeDiv(bridgeId) {
  var el = document.getElementById(bridgeId);
  if (!el) return null;
  var text = el.textContent || "";
  var result = {};
  text.split("|").forEach(function (part) {
    var idx = part.indexOf(":");
    if (idx === -1) return;
    result[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  });
  return result;
}

function parseRows(contentValue) {
  try {
    var parsed = JSON.parse(contentValue || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

// Page 1's tree selection wire format is opaque — pull a "site"-like field out of
// it if it's JSON, otherwise fall back to substring-matching the raw blob.
function extractSiteHint(rawSiteSelection) {
  if (!rawSiteSelection) return null;
  try {
    var obj = JSON.parse(rawSiteSelection);
    if (obj && typeof obj === "object") {
      var keys = Object.keys(obj);
      var siteKey = keys.find(function (k) { return k.toLowerCase().indexOf("site") !== -1; });
      if (siteKey && obj[siteKey]) return String(obj[siteKey]);
    }
  } catch (e) {
    // not JSON — fall through to raw blob
  }
  return rawSiteSelection;
}

function entriesForSite(allEntries, rawSiteSelection) {
  var entries = allEntries || [];
  var siteHint = extractSiteHint(rawSiteSelection);
  var matching = entries;
  if (siteHint) {
    var filtered = entries.filter(function (entry) {
      var siteProp = (entry.properties || []).find(function (p) { return p.developerName === "site"; });
      var siteVal = siteProp && siteProp.contentValue;
      return siteVal && siteHint.indexOf(siteVal) !== -1;
    });
    if (filtered.length) matching = filtered;
  }
  return matching;
}

// Site-wide (not per-device) — every Device dropdown shows the same list: all
// devices belonging to the site picked on page 1.
function distinctDevicesForSite(allEntries, rawSiteSelection) {
  var matching = entriesForSite(allEntries, rawSiteSelection);
  var devices = [];
  matching.forEach(function (entry) {
    var deviceProp = (entry.properties || []).find(function (p) { return p.developerName === "device"; });
    var deviceVal = deviceProp && deviceProp.contentValue;
    if (deviceVal && devices.indexOf(deviceVal) === -1) devices.push(deviceVal);
  });
  return devices;
}

// Site-wide (not per-device) — every Interface dropdown shows the same list: all
// ports across every device at the site picked on page 1.
function distinctPortsForSite(allEntries, rawSiteSelection) {
  var matching = entriesForSite(allEntries, rawSiteSelection);
  var ports = [];
  matching.forEach(function (entry) {
    var portsProp = (entry.properties || []).find(function (p) { return p.developerName === "ports"; });
    var portItems = (portsProp && portsProp.objectData) || [];
    portItems.forEach(function (item) {
      var portProp = (item.properties || []).find(function (p) { return p.developerName === "port"; });
      var portVal = portProp && portProp.contentValue;
      if (portVal && ports.indexOf(portVal) === -1) ports.push(portVal);
    });
  });
  return ports;
}

// ---- mode: data-bridge (invisible; feeds AllEntries into shared state) ----
const DataBridge = ({ element }) => {
  React.useEffect(function () {
    window.__selectionGridBridge.allEntries = element.objectData || [];
  }, [element.objectData]);
  var debug = (element.attributes && element.attributes.debug) === "true";
  if (!debug) return null;
  var count = (element.objectData || []).length;
  return React.createElement(
    "div",
    { style: { fontSize: "11px", color: "#888" } },
    "DEBUG: AllEntries entries received = " + count
  );
};

function useSiteScopedOptions(siteBridgeId) {
  const [options, setOptions] = React.useState({ devices: [], ports: [] });

  React.useEffect(function () {
    var timer = setInterval(function () {
      var bridge = readBridgeDiv(siteBridgeId);
      var rawSite = bridge ? bridge.SiteSelection : null;
      var devices = distinctDevicesForSite(window.__selectionGridBridge.allEntries, rawSite);
      var ports = distinctPortsForSite(window.__selectionGridBridge.allEntries, rawSite);
      setOptions(function (prev) {
        var sameDevices = prev.devices.length === devices.length && prev.devices.every(function (v, i) { return v === devices[i]; });
        var samePorts = prev.ports.length === ports.length && prev.ports.every(function (v, i) { return v === ports[i]; });
        return sameDevices && samePorts ? prev : { devices: devices, ports: ports };
      });
    }, 400);
    return function () { clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteBridgeId]);

  return options;
}

function selectCell(value, options, disabled, onChange, placeholder) {
  return React.createElement(
    "select",
    { className: "sgt-select", disabled: disabled, value: value, onChange: function (e) { onChange(e.target.value); } },
    [React.createElement("option", { key: "__blank", value: "" }, placeholder || "-- Select --")].concat(
      options.map(function (o) { return React.createElement("option", { key: o, value: o }, o); })
    )
  );
}

function textCell(value, disabled, onChange) {
  return React.createElement("input", {
    type: "text",
    className: "sgt-input",
    disabled: disabled,
    value: value,
    onChange: function (e) { onChange(e.target.value); },
  });
}

// ---- mode: grid-table (entry row pinned inside the table + Add; committed rows + Delete) ----
const GridTable = ({ element, updateElement }) => {
  var siteBridgeId = (element.attributes && element.attributes.siteBridgeId) || "grid-site-bridge";
  var interfacePrefix = (element.attributes && element.attributes.prefix) || "GigaEthernet";
  var siteOptions = useSiteScopedOptions(siteBridgeId);

  const [rows, setRows] = React.useState(function () { return parseRows(element.contentValue); });
  const [entry, setEntry] = React.useState(BLANK_ROW);

  React.useEffect(function () {
    setRows(parseRows(element.contentValue));
  }, [element.contentValue]);

  const persist = function (next) {
    setRows(next);
    updateElement({ elementId: element.id, elementPartial: { contentValue: JSON.stringify(next) } });
  };

  const setField = function (key, value) {
    setEntry(function (prev) {
      var next = Object.assign({}, prev);
      next[key] = value;
      if (key === "accessType" && value !== "INNI") {
        next.inniType = ""; next.deviceB = ""; next.interfaceB = ""; next.commentB = "";
      }
      return next;
    });
  };

  const handleAdd = function () {
    if (!element.isEditable) return;
    persist(rows.concat([entry]));
    setEntry(BLANK_ROW);
  };

  const handleDelete = function (idx) {
    if (!element.isEditable) return;
    var next = rows.slice();
    next.splice(idx, 1);
    persist(next);
  };

  var isINNI = entry.accessType === "INNI";
  var portOptions = siteOptions.ports.map(function (p) { return interfacePrefix + p; });

  var headerCells = COLUMNS.map(function (c) { return React.createElement("th", { key: c.key }, c.label); });
  headerCells.push(React.createElement("th", { key: "__actions" }, ""));

  var entryRow = null;
  if (element.isEditable) {
    entryRow = React.createElement("tr", { key: "__entry", className: "sgt-entry-row" }, [
      React.createElement("td", { key: "serviceOrderEnd" }, selectCell(entry.serviceOrderEnd, ["A End", "B End"], false, function (v) { setField("serviceOrderEnd", v); })),
      React.createElement("td", { key: "accessType" }, selectCell(entry.accessType, ["UNI", "INNI"], false, function (v) { setField("accessType", v); })),
      React.createElement("td", { key: "inniType" }, selectCell(entry.inniType, ["NTU"], !isINNI, function (v) { setField("inniType", v); })),
      React.createElement("td", { key: "topologyType" }, selectCell(entry.topologyType, ["SH-LAG", "LINK"], false, function (v) { setField("topologyType", v); })),
      React.createElement("td", { key: "deviceA" }, selectCell(entry.deviceA, siteOptions.devices, false, function (v) { setField("deviceA", v); })),
      React.createElement("td", { key: "interfaceA" }, selectCell(entry.interfaceA, portOptions, false, function (v) { setField("interfaceA", v); })),
      React.createElement("td", { key: "commentA" }, textCell(entry.commentA, false, function (v) { setField("commentA", v); })),
      React.createElement("td", { key: "deviceB" }, selectCell(entry.deviceB, siteOptions.devices, !isINNI, function (v) { setField("deviceB", v); })),
      React.createElement("td", { key: "interfaceB" }, selectCell(entry.interfaceB, portOptions, !isINNI, function (v) { setField("interfaceB", v); })),
      React.createElement("td", { key: "commentB" }, textCell(entry.commentB, !isINNI, function (v) { setField("commentB", v); })),
      React.createElement(
        "td",
        { key: "__actions" },
        React.createElement("button", { type: "button", className: "sgt-add-btn", onClick: handleAdd }, "Add")
      ),
    ]);
  }

  var bodyRows = rows.map(function (row, idx) {
    var cells = COLUMNS.map(function (c) { return React.createElement("td", { key: c.key }, row[c.key] || ""); });
    if (element.isEditable) {
      cells.push(
        React.createElement(
          "td",
          { key: "__actions" },
          React.createElement("button", { type: "button", className: "sgt-delete-btn", onClick: function () { handleDelete(idx); } }, "Delete")
        )
      );
    }
    return React.createElement("tr", { key: idx }, cells);
  });

  if (!bodyRows.length && !entryRow) {
    bodyRows = [
      React.createElement(
        "tr",
        { key: "empty" },
        React.createElement("td", { colSpan: COLUMNS.length + 1 }, "No rows added yet.")
      ),
    ];
  }

  var tbodyRows = entryRow ? [entryRow].concat(bodyRows) : bodyRows;

  return React.createElement(
    "div",
    { className: "sgt-wrapper" },
    React.createElement(
      "table",
      { className: "sgt-table" },
      React.createElement("thead", null, React.createElement("tr", null, headerCells)),
      React.createElement("tbody", null, tbodyRows)
    )
  );
};

const SelectionGridTable = (props) => {
  injectStyles();
  var mode = (props.element.attributes && props.element.attributes.mode) || "grid-table";
  if (mode === "data-bridge") return React.createElement(DataBridge, props);
  return React.createElement(GridTable, props);
};

export default SelectionGridTable;
