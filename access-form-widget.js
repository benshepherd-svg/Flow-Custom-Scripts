const { React } = window.boomi.flow;

const TABLE_COLUMNS = [
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

// Shared, synchronous, in-page state — every field instance writes here directly on
// change and reads it directly (no server round-trip, no merge-field staleness).
if (!window.__accessFormBridge) {
  window.__accessFormBridge = {
    allEntries: [],
    values: {
      serviceOrderEnd: "", accessType: "", inniType: "", topologyType: "",
      deviceA: "", interfaceA: "", commentA: "",
      deviceB: "", interfaceB: "", commentB: "",
    },
  };
}

function injectStyles() {
  if (document.getElementById("access-form-widget-styles")) return;
  var style = document.createElement("style");
  style.id = "access-form-widget-styles";
  style.textContent =
    ".afw-select,.afw-textarea{padding:6px;min-width:220px;}" +
    ".order-line-table-wrapper{margin-top:8px;}" +
    ".order-line-add-btn{margin-bottom:8px;padding:6px 14px;cursor:pointer;}" +
    ".order-line-table{border-collapse:collapse;width:100%;}" +
    ".order-line-table th,.order-line-table td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px;}" +
    ".order-line-table th{background:#f5f5f5;}" +
    ".order-line-delete-btn{padding:4px 10px;cursor:pointer;}" +
    ".afw-raw-json{background:#f5f5f5;border:1px solid #ccc;padding:10px;font-size:12px;white-space:pre-wrap;word-break:break-word;margin-top:8px;}";
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

function commit(element, updateElement, value) {
  updateElement({ elementId: element.id, elementPartial: { contentValue: value } });
}

function setShared(key, value) {
  window.__accessFormBridge.values[key] = value;
}

// Generic conditional-enable: if attributes.dependsOnKey is set, this field is only
// enabled when window.__accessFormBridge.values[dependsOnKey] === attributes.enableWhen.
// No dependsOnKey configured => always enabled (backward compatible).
function useDependsOn(attributes) {
  var dependsOnKey = attributes && attributes.dependsOnKey;
  var enableWhen = attributes && attributes.enableWhen;
  const [depValue, setDepValue] = React.useState("");

  React.useEffect(function () {
    if (!dependsOnKey) return undefined;
    var timer = setInterval(function () {
      var val = window.__accessFormBridge.values[dependsOnKey] || "";
      setDepValue(function (prev) { return prev === val ? prev : val; });
    }, 400);
    return function () { clearInterval(timer); };
  }, [dependsOnKey]);

  if (!dependsOnKey) return true;
  return depValue === enableWhen;
}

// The page-1 tree selection's exact wire format is opaque (custom component, no
// source available) — try to pull a "site"-like field out of it if it's JSON,
// otherwise fall back to treating it as an opaque blob and substring-matching.
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
// ports across every device at the site picked on page 1 (matches page 1's tree).
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

// ---- mode: json-view (parses contentValue as JSON, renders a table + raw JSON below) ----
const JsonView = ({ element }) => {
  var raw = element.contentValue || "";
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }

  var tableEl = null;
  if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "object" && parsed[0] !== null) {
    var cols = Object.keys(parsed[0]);
    tableEl = React.createElement(
      "table",
      { className: "order-line-table" },
      React.createElement("thead", null, React.createElement("tr", null, cols.map(function (c) {
        return React.createElement("th", { key: c }, c);
      }))),
      React.createElement("tbody", null, parsed.map(function (row, i) {
        return React.createElement("tr", { key: i }, cols.map(function (c) {
          return React.createElement("td", { key: c }, row[c] == null ? "" : String(row[c]));
        }));
      }))
    );
  } else if (parsed && typeof parsed === "object") {
    var keys = Object.keys(parsed);
    tableEl = React.createElement(
      "table",
      { className: "order-line-table" },
      React.createElement("tbody", null, keys.map(function (k) {
        var v = parsed[k];
        var display = v && typeof v === "object" ? JSON.stringify(v) : (v == null ? "" : String(v));
        return React.createElement("tr", { key: k }, [
          React.createElement("th", { key: "k" }, k),
          React.createElement("td", { key: "v" }, display),
        ]);
      }))
    );
  }

  return React.createElement("div", { className: "order-line-table-wrapper" }, [
    tableEl,
    React.createElement("pre", { key: "raw", className: "afw-raw-json" }, raw || "(empty)"),
  ]);
};

// ---- mode: raw-json (just the raw contentValue in a <pre>, for demonstration) ----
const RawJson = ({ element }) => {
  return React.createElement("pre", { className: "afw-raw-json" }, element.contentValue || "(empty)");
};

// ---- mode: data-bridge (invisible; feeds AllEntries into shared state) ----
const DataBridge = ({ element }) => {
  React.useEffect(function () {
    window.__accessFormBridge.allEntries = element.objectData || [];
  }, [element.objectData]);
  return null;
};

// ---- mode: dropdown (plain static options, comma-separated in attributes.options) ----
const DropdownField = ({ element, updateElement }) => {
  var opts = (element.attributes && element.attributes.options) || "";
  var options = opts.split(",").map(function (o) { return o.trim(); }).filter(Boolean);
  var fieldKey = element.attributes && element.attributes.fieldKey;
  var current = element.contentValue || "";

  React.useEffect(function () {
    if (fieldKey) setShared(fieldKey, current);
  }, [fieldKey, current]);

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !element.isEditable,
      value: current,
      onChange: function (e) {
        if (fieldKey) setShared(fieldKey, e.target.value);
        commit(element, updateElement, e.target.value);
      },
    },
    [React.createElement("option", { key: "__blank", value: "" }, "-- Select --")].concat(
      options.map(function (o) {
        return React.createElement("option", { key: o, value: o }, o);
      })
    )
  );
};

// ---- mode: textarea (free text, e.g. Comment A / Comment B) ----
const TextareaField = ({ element, updateElement }) => {
  var fieldKey = element.attributes && element.attributes.fieldKey;
  var dependsEnabled = useDependsOn(element.attributes);
  var enabled = element.isEditable && dependsEnabled;
  var current = dependsEnabled ? (element.contentValue || "") : "";

  React.useEffect(function () {
    if (!dependsEnabled && element.contentValue) {
      commit(element, updateElement, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependsEnabled]);

  React.useEffect(function () {
    if (fieldKey) setShared(fieldKey, current);
  }, [fieldKey, current]);

  return React.createElement("textarea", {
    className: "afw-textarea",
    disabled: !enabled,
    value: current,
    onChange: function (e) {
      if (fieldKey) setShared(fieldKey, e.target.value);
      commit(element, updateElement, e.target.value);
    },
  });
};

// ---- mode: device (options = distinct devices from AllEntries, scoped to page-1 site) ----
const DeviceField = ({ element, updateElement }) => {
  var fieldKey = (element.attributes && element.attributes.fieldKey) || "deviceA";
  var siteBridgeId = (element.attributes && element.attributes.siteBridgeId) || "site-bridge";
  var fallback = ((element.attributes && element.attributes.fallbackOptions) || "")
    .split(",").map(function (o) { return o.trim(); }).filter(Boolean);
  var dependsEnabled = useDependsOn(element.attributes);
  var enabled = element.isEditable && dependsEnabled;
  var current = dependsEnabled ? (element.contentValue || "") : "";

  const [options, setOptions] = React.useState([]);

  React.useEffect(function () {
    var timer = setInterval(function () {
      var bridge = readBridgeDiv(siteBridgeId);
      var rawSite = bridge ? bridge.SiteSelection : null;
      var devices = distinctDevicesForSite(window.__accessFormBridge.allEntries, rawSite);
      if (!devices.length) devices = fallback;
      setOptions(function (prev) {
        var same = prev.length === devices.length && prev.every(function (v, i) { return v === devices[i]; });
        return same ? prev : devices;
      });
    }, 400);
    return function () { clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteBridgeId]);

  React.useEffect(function () {
    if (!dependsEnabled && element.contentValue) {
      commit(element, updateElement, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependsEnabled]);

  React.useEffect(function () {
    if (fieldKey) setShared(fieldKey, current);
  }, [fieldKey, current]);

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !enabled,
      value: current,
      onChange: function (e) {
        if (fieldKey) setShared(fieldKey, e.target.value);
        commit(element, updateElement, e.target.value);
      },
    },
    [React.createElement("option", { key: "__blank", value: "" }, "-- Select --")].concat(
      options.map(function (o) {
        return React.createElement("option", { key: o, value: o }, o);
      })
    )
  );
};

// ---- mode: interface (ports for the currently selected Device A/B, value = prefix+port) ----
const InterfaceField = ({ element, updateElement }) => {
  var prefix = (element.attributes && element.attributes.prefix) || "GigaEthernet";
  var siteBridgeId = (element.attributes && element.attributes.siteBridgeId) || "site-bridge";
  var fieldKey = (element.attributes && element.attributes.fieldKey) || "interfaceA";
  var fallbackPorts = ((element.attributes && element.attributes.fallbackPorts) || "")
    .split(",").map(function (p) { return p.trim(); }).filter(Boolean);
  var dependsEnabled = useDependsOn(element.attributes);
  var enabled = element.isEditable && dependsEnabled;
  var current = dependsEnabled ? (element.contentValue || "") : "";

  const [ports, setPorts] = React.useState([]);

  React.useEffect(function () {
    var timer = setInterval(function () {
      var bridge = readBridgeDiv(siteBridgeId);
      var rawSite = bridge ? bridge.SiteSelection : null;
      var found = distinctPortsForSite(window.__accessFormBridge.allEntries, rawSite);
      if (!found.length) found = fallbackPorts;
      setPorts(function (prev) {
        var same = prev.length === found.length && prev.every(function (v, i) { return v === found[i]; });
        return same ? prev : found;
      });
    }, 400);
    return function () { clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteBridgeId]);

  React.useEffect(function () {
    if (!dependsEnabled && element.contentValue) {
      commit(element, updateElement, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dependsEnabled]);

  React.useEffect(function () {
    if (fieldKey) setShared(fieldKey, current);
  }, [fieldKey, current]);

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !enabled,
      value: current,
      onChange: function (e) {
        if (fieldKey) setShared(fieldKey, e.target.value);
        commit(element, updateElement, e.target.value);
      },
    },
    [React.createElement("option", { key: "__blank", value: "" }, "-- Select --")].concat(
      ports.map(function (p) {
        var full = prefix + p;
        return React.createElement("option", { key: full, value: full }, full);
      })
    )
  );
};

// ---- mode: inni-type (enabled + "NTU" only when Access Type == INNI, else disabled + cleared) ----
const InniTypeField = ({ element, updateElement }) => {
  var dependsOnKey = (element.attributes && element.attributes.dependsOnKey) || "accessType";
  var enableWhen = (element.attributes && element.attributes.enableWhen) || "INNI";
  var option = (element.attributes && element.attributes.option) || "NTU";
  var fieldKey = (element.attributes && element.attributes.fieldKey) || "inniType";

  const [dependsOnValue, setDependsOnValue] = React.useState("");

  React.useEffect(function () {
    var timer = setInterval(function () {
      var val = window.__accessFormBridge.values[dependsOnKey] || "";
      setDependsOnValue(function (prev) { return prev === val ? prev : val; });
    }, 400);
    return function () { clearInterval(timer); };
  }, [dependsOnKey]);

  const enabled = dependsOnValue === enableWhen;

  React.useEffect(function () {
    if (!enabled && element.contentValue) {
      commit(element, updateElement, "");
      setShared(fieldKey, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  var current = enabled ? (element.contentValue || "") : "";

  React.useEffect(function () {
    setShared(fieldKey, current);
  }, [fieldKey, current]);

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !element.isEditable || !enabled,
      value: current,
      onChange: function (e) {
        setShared(fieldKey, e.target.value);
        commit(element, updateElement, e.target.value);
      },
    },
    [
      React.createElement("option", { key: "__blank", value: "" }, "-- Select --"),
      React.createElement("option", { key: option, value: option }, option),
    ]
  );
};

// ---- mode: order-table (Add/Delete rows, reads shared state directly) ----
const OrderTable = ({ element, updateElement }) => {
  const [rows, setRows] = React.useState(function () {
    return parseRows(element.contentValue);
  });

  React.useEffect(function () {
    setRows(parseRows(element.contentValue));
  }, [element.contentValue]);

  const persist = function (next) {
    setRows(next);
    updateElement({ elementId: element.id, elementPartial: { contentValue: JSON.stringify(next) } });
  };

  const handleAdd = function () {
    if (!element.isEditable) return;
    var v = window.__accessFormBridge.values;
    var row = {
      serviceOrderEnd: v.serviceOrderEnd || "",
      accessType: v.accessType || "",
      inniType: v.inniType || "",
      topologyType: v.topologyType || "",
      deviceA: v.deviceA || "",
      interfaceA: v.interfaceA || "",
      commentA: v.commentA || "",
      deviceB: v.deviceB || "",
      interfaceB: v.interfaceB || "",
      commentB: v.commentB || "",
    };
    persist(rows.concat([row]));
  };

  const handleDelete = function (idx) {
    if (!element.isEditable) return;
    var next = rows.slice();
    next.splice(idx, 1);
    persist(next);
  };

  var headerCells = TABLE_COLUMNS.map(function (c) {
    return React.createElement("th", { key: c.key }, c.label);
  });
  if (element.isEditable) headerCells.push(React.createElement("th", { key: "__actions" }, ""));

  var bodyRows = rows.map(function (row, idx) {
    var cells = TABLE_COLUMNS.map(function (c) {
      return React.createElement("td", { key: c.key }, row[c.key] || "");
    });
    if (element.isEditable) {
      cells.push(
        React.createElement(
          "td",
          { key: "__actions" },
          React.createElement(
            "button",
            {
              type: "button",
              className: "order-line-delete-btn",
              onClick: function () { handleDelete(idx); },
            },
            "Delete"
          )
        )
      );
    }
    return React.createElement("tr", { key: idx }, cells);
  });

  if (!bodyRows.length) {
    bodyRows = [
      React.createElement(
        "tr",
        { key: "empty" },
        React.createElement("td", { colSpan: TABLE_COLUMNS.length + 1 }, "No rows added yet.")
      ),
    ];
  }

  var children = [];
  if (element.isEditable) {
    children.push(
      React.createElement(
        "button",
        { key: "add-btn", type: "button", className: "order-line-add-btn", onClick: handleAdd },
        "Add"
      )
    );
  }
  children.push(
    React.createElement(
      "table",
      { key: "table", className: "order-line-table" },
      React.createElement("thead", null, React.createElement("tr", null, headerCells)),
      React.createElement("tbody", null, bodyRows)
    )
  );

  return React.createElement("div", { className: "order-line-table-wrapper" }, children);
};

const AccessFormWidget = (props) => {
  injectStyles();
  var mode = (props.element.attributes && props.element.attributes.mode) || "dropdown";
  if (mode === "data-bridge") return React.createElement(DataBridge, props);
  if (mode === "textarea") return React.createElement(TextareaField, props);
  if (mode === "device") return React.createElement(DeviceField, props);
  if (mode === "interface") return React.createElement(InterfaceField, props);
  if (mode === "inni-type") return React.createElement(InniTypeField, props);
  if (mode === "order-table") return React.createElement(OrderTable, props);
  if (mode === "json-view") return React.createElement(JsonView, props);
  if (mode === "raw-json") return React.createElement(RawJson, props);
  return React.createElement(DropdownField, props);
};

export default AccessFormWidget;
