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

function injectStyles() {
  if (document.getElementById("access-form-widget-styles")) return;
  var style = document.createElement("style");
  style.id = "access-form-widget-styles";
  style.textContent =
    ".afw-select{padding:6px;min-width:220px;}" +
    ".order-line-table-wrapper{margin-top:8px;}" +
    ".order-line-add-btn{margin-bottom:8px;padding:6px 14px;cursor:pointer;}" +
    ".order-line-table{border-collapse:collapse;width:100%;}" +
    ".order-line-table th,.order-line-table td{border:1px solid #ccc;padding:6px 10px;text-align:left;font-size:13px;}" +
    ".order-line-table th{background:#f5f5f5;}" +
    ".order-line-delete-btn{padding:4px 10px;cursor:pointer;}";
  document.head.appendChild(style);
}

function readBridge(bridgeId) {
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

// ---- mode: dropdown (plain static options, comma-separated in attributes.options) ----
const DropdownField = ({ element, updateElement }) => {
  var opts = (element.attributes && element.attributes.options) || "";
  var options = opts.split(",").map(function (o) { return o.trim(); }).filter(Boolean);
  var current = element.contentValue || "";

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !element.isEditable,
      value: current,
      onChange: function (e) {
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

// ---- mode: inni-type (enabled + "NTU" only when Access Type == INNI, else disabled + cleared) ----
const InniTypeField = ({ element, updateElement }) => {
  var bridgeId = (element.attributes && element.attributes.bridgeId) || "field-bridge";
  var dependsOnKey = (element.attributes && element.attributes.dependsOnKey) || "AccessType";
  var enableWhen = (element.attributes && element.attributes.enableWhen) || "INNI";
  var option = (element.attributes && element.attributes.option) || "NTU";

  const [accessType, setAccessType] = React.useState("");

  React.useEffect(function () {
    var timer = setInterval(function () {
      var bridge = readBridge(bridgeId);
      if (!bridge) return;
      var val = bridge[dependsOnKey] || "";
      setAccessType(function (prev) {
        if (prev !== val) return val;
        return prev;
      });
    }, 400);
    return function () { clearInterval(timer); };
  }, [bridgeId, dependsOnKey]);

  const enabled = accessType === enableWhen;

  React.useEffect(function () {
    if (!enabled && element.contentValue) {
      commit(element, updateElement, "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  var current = enabled ? (element.contentValue || "") : "";

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !element.isEditable || !enabled,
      value: current,
      onChange: function (e) {
        commit(element, updateElement, e.target.value);
      },
    },
    [
      React.createElement("option", { key: "__blank", value: "" }, "-- Select --"),
      React.createElement("option", { key: option, value: option }, option),
    ]
  );
};

// ---- mode: interface (port-number list, value/label = prefix + port, e.g. GigaEthernet0/0/0/1) ----
const InterfaceField = ({ element, updateElement }) => {
  var prefix = (element.attributes && element.attributes.prefix) || "GigaEthernet";
  var ports = ((element.attributes && element.attributes.ports) || "")
    .split(",")
    .map(function (p) { return p.trim(); })
    .filter(Boolean);
  var current = element.contentValue || "";

  return React.createElement(
    "select",
    {
      className: "afw-select",
      disabled: !element.isEditable,
      value: current,
      onChange: function (e) {
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

// ---- mode: order-table (Add/Delete rows, reads field-bridge for current field values) ----
const OrderTable = ({ element, updateElement }) => {
  var bridgeId = (element.attributes && element.attributes.bridgeId) || "field-bridge";

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
    var bridge = readBridge(bridgeId);
    if (!bridge) return;
    var row = {
      serviceOrderEnd: bridge.ServiceOrderEnd || "",
      accessType: bridge.AccessType || "",
      inniType: bridge.INNIType || "",
      topologyType: bridge.TopologyType || "",
      deviceA: bridge.DeviceA || "",
      interfaceA: bridge.InterfaceA || "",
      commentA: bridge.CommentA || "",
      deviceB: bridge.DeviceB || "",
      interfaceB: bridge.InterfaceB || "",
      commentB: bridge.CommentB || "",
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
  if (mode === "inni-type") return React.createElement(InniTypeField, props);
  if (mode === "interface") return React.createElement(InterfaceField, props);
  if (mode === "order-table") return React.createElement(OrderTable, props);
  return React.createElement(DropdownField, props);
};

export default AccessFormWidget;
