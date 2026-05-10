class DailyScheduleCard extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;

    if (!this._dialog) {
      this._getInputTimeWidth();
      this._createDialog();
      this.appendChild(this._dialog);
    } else {
      this._dialog.hass = hass;
    }

    if (!this._content) {
      this._content = this._createContent();
      if (this._config.title || this._config.card) {
        const card = document.createElement("ha-card");
        card.header = this._config.title;
        this._content.classList.add("card-content");
        card.appendChild(this._content);
        this.appendChild(card);
      } else {
        this.appendChild(this._content);
      }
    } else {
      this._updateContent();
    }
  }

  setConfig(config) {
    if (
      this._config !== null &&
      JSON.stringify(this._config) === JSON.stringify(config)
    ) {
      this._config = config;
      return;
    }
    if (!config.entities) throw new Error("You need to define entities");
    this._config = config;
    this.innerHTML = "";
    this._content = null;
    this._dialog = null;
  }

  getCardSize() {
    return this._config ? this._config.entities.length : 1;
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        {
          name: "entities",
          required: true,
          selector: {
            entity: {
              multiple: true,
              reorder: true,
              filter: { domain: "binary_sensor", integration: "daily_schedule" },
            },
          },
        },
      ],
      assertConfig: (config) => {
        if (Array.isArray(config?.entities)) {
          for (const entry of config.entities) {
            if (typeof entry !== "string") {
              throw new Error("Visual editor is not available for entity options.");
            }
          }
        }
      },
      computeLabel: (schema, localize) => {
        switch (schema.name) {
          case "title":
            return `${localize("ui.panel.lovelace.editor.card.generic.title")} (${localize("ui.panel.lovelace.editor.card.config.optional")})`;
          case "entities":
            return `${localize("ui.panel.lovelace.editor.card.generic.entities")} (${localize("ui.panel.lovelace.editor.card.config.required")})`;
          default:
            return schema.name;
        }
      },
    };
  }

  static getStubConfig() {
    return { card: true, entities: [] };
  }

  _createContent() {
    const content = document.createElement("div");
    content._rows = [];
    Object.assign(content.style, {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    });

    for (const entry of this._config.entities) {
      const entity = entry.entity || entry;
      const row = document.createElement("div");
      row._entity = entity;
      row._template_value = entry.template || this._config.template;
      row.classList.add("card-content");

      if (this._hass.states[entity]) {
        const rowContent = this._createCardRow(
          entity,
          entry.name || this._hass.states[entity].attributes.friendly_name || entity,
        );
        row._content = rowContent;
        this._setCardRowValue(row);
        row.appendChild(rowContent);
        content._rows.push(row);
      } else {
        row.innerText = `Entity not found: ${entity}`;
        row.style.color = "var(--error-color)";
      }
      content.appendChild(row);
    }
    return content;
  }

  _updateContent() {
    for (const row of this._content._rows) {
      row._content._icon.hass = this._hass;
      row._content._icon.stateObj = this._hass.states[row._entity];
      this._setCardRowValue(row);
    }
  }

  _createCardRow(entity, name) {
    const content = document.createElement("div");
    Object.assign(content.style, {
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "12px",
      borderRadius: "12px",
      border: "1px solid var(--divider-color)",
      transition: "transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
    });

    content.addEventListener("mouseenter", () => {
      content.style.transform = "translateY(-1px)";
      content.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)";
      content.style.backgroundColor = "var(--state-icon-hover-color, rgba(0,0,0,0.03))";
    });
    content.addEventListener("mouseleave", () => {
      content.style.transform = "";
      content.style.boxShadow = "";
      content.style.backgroundColor = "";
    });

    const topRow = document.createElement("div");
    Object.assign(topRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    });

    const icon = document.createElement("state-badge");
    icon.style.flex = "none";
    icon.hass = this._hass;
    icon.stateObj = this._hass.states[entity];
    icon.stateColor = true;
    content._icon = icon;
    topRow.appendChild(icon);

    const nameEl = document.createElement("span");
    nameEl.innerText = name;
    Object.assign(nameEl.style, {
      fontWeight: "500",
      fontSize: "15px",
      color: "var(--primary-text-color)",
    });
    topRow.appendChild(nameEl);
    content.appendChild(topRow);

    const valueEl = document.createElement("div");
    Object.assign(valueEl.style, {
      marginInlineStart: "calc(40px + 12px)",
      fontSize: "13px",
      color: "var(--secondary-text-color)",
      padding: "4px 10px",
      background: "rgba(var(--rgb-primary-color, 3,169,244), 0.08)",
      borderRadius: "8px",
      display: "inline-block",
      maxWidth: "fit-content",
    });
    content._value_element = valueEl;
    content.appendChild(valueEl);

    content.onclick = () => {
      this._dialog._entity = entity;
      this._dialog.headerTitle = name;
      this._dialog._message.innerText = "";
      this._dialog._message.style.display = "none";
      this._dialog._schedule = [...this._getStateSchedule(entity)];
      this._createDialogRows();
      this._dialog.open = true;
    };
    return content;
  }

  _getStateSchedule(entity, effective = false) {
    const state = this._hass.states[entity];
    return !state
      ? []
      : !effective
        ? state.attributes.schedule || []
        : state.attributes.effective_schedule || [];
  }

  _rowEntityChanged(row) {
    const entity_data = this._hass.states[row._entity]
      ? JSON.stringify(
          (({ state, attributes }) => ({ state, attributes }))(
            this._hass.states[row._entity],
          ),
        )
      : null;
    const changed = row._entity_data !== entity_data;
    row._entity_data = entity_data;
    return changed;
  }

  _rowTemplateValue(row) {
    const subscribed = this._hass.connection.subscribeMessage(
      (message) => {
        row._content._value_element.innerHTML = message.result.length
          ? `<bdi dir="ltr">${message.result}</bdi>`
          : "&empty;";
        subscribed.then((unsub) => unsub());
      },
      {
        type: "render_template",
        template: row._template_value,
        variables: { entity_id: row._entity },
      },
    );
  }

  _setCardRowValue(row) {
    if (!this._rowEntityChanged(row)) return;

    if (!row._template_value) {
      const schedule = this._getStateSchedule(row._entity, true);
      if (!schedule.length) {
        row._content._value_element.innerHTML = "&empty;";
      } else if (schedule.length === 1 && schedule[0].from === schedule[0].to) {
        row._content._value_element.innerHTML = "&infin;";
      } else {
        const ranges = schedule
          .map((range) => `${range.from.slice(0, -3)}-${range.to.slice(0, -3)}`)
          .join(", ");
        row._content._value_element.innerHTML = `<bdi dir="ltr">${ranges}</bdi>`;
      }
    } else {
      this._rowTemplateValue(row);
    }
  }

  _isMobileView() {
    return window.matchMedia("(max-width: 600px)").matches;
  }

  _createDialog() {
    if (!this._isMobileView()) {
      this._dialog = document.createElement("ha-dialog");
    } else {
      this._dialog = document.createElement("ha-adaptive-dialog");
      this._dialog.setAttribute("flexcontent", "");
      this._dialog.style.setProperty(
        "--ha-bottom-sheet-height",
        "calc(100dvh - max(var(--safe-area-inset-top), 48px))",
      );
      this._dialog.style.setProperty(
        "--ha-bottom-sheet-max-height",
        "var(--ha-bottom-sheet-height)",
      );
    }
    this._dialog.hass = this._hass;
    this._dialog.setAttribute("dir", "ltr");
    this._dialog.addEventListener("closed", () => {
      this._dialog.open = false;
    });
    this._createDialogHeader();
    this._dialog.open = false;

    const scroller = document.createElement("div");
    Object.assign(scroller.style, {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      padding: "4px 0 16px",
      boxSizing: "border-box",
    });
    this._dialog._scroller = scroller;
    this._dialog.appendChild(scroller);

    const plus = document.createElement("button");
    Object.assign(plus.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "11px 18px",
      marginTop: "4px",
      background: "#ffeb3b",
      color: "#000",
      border: "2px solid #fbc02d",
      borderRadius: "12px",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "600",
      transition: "transform 0.15s ease, box-shadow 0.15s ease, background 0.15s ease",
      boxShadow: "0 2px 6px rgba(255,235,59,0.35)",
    });
    plus.addEventListener("mouseenter", () => {
      plus.style.background = "#fdd835";
      plus.style.transform = "translateY(-1px)";
      plus.style.boxShadow = "0 4px 14px rgba(255,235,59,0.45)";
    });
    plus.addEventListener("mouseleave", () => {
      plus.style.background = "#ffeb3b";
      plus.style.transform = "";
      plus.style.boxShadow = "0 2px 6px rgba(255,235,59,0.35)";
    });
    const plusIcon = document.createElement("ha-icon");
    plusIcon.icon = "mdi:plus";
    plusIcon.style.setProperty("--mdc-icon-size", "20px");
    plus.appendChild(plusIcon);
    const plusLabel = document.createElement("span");
    plusLabel.innerText = "Add time range";
    plus.appendChild(plusLabel);
    plus.onclick = () => {
      this._dialog._schedule.push({ from: null, to: null });
      this._createDialogRows();
      this._saveBackendEntity();
    };
    this._dialog._plus = plus;

    const message = document.createElement("div");
    Object.assign(message.style, {
      display: "none",
      color: "var(--error-color, #d32f2f)",
      padding: "10px 14px",
      background: "rgba(211,47,47,0.08)",
      borderRadius: "8px",
      border: "1px solid rgba(211,47,47,0.2)",
      fontSize: "13px",
      fontWeight: "500",
    });
    this._dialog._message = message;
  }

  _createDialogRows() {
    this._dialog._scroller.innerHTML = "";
    for (const [index, range] of this._dialog._schedule.entries()) {
      this._dialog._scroller.appendChild(this._createDialogRow(range, index));
    }
    this._dialog._scroller.appendChild(this._dialog._plus);
    this._dialog._scroller.appendChild(this._dialog._message);
  }

  _createDialogHeader() {
    const header = document.createElement("div");
    header.slot = "headerNavigationIcon";
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
    });

    const close = document.createElement("ha-icon-button");
    close.dataset.role = "dialog-close";
    const closeIcon = document.createElement("ha-icon");
    closeIcon.icon = "mdi:close";
    close.appendChild(closeIcon);
    close.onclick = () => {
      this._dialog.open = false;
    };
    header.appendChild(close);

    const moreInfo = document.createElement("ha-icon-button");
    moreInfo.slot = "headerActionItems";
    moreInfo.dataset.role = "more-info";
    const moreInfoIcon = document.createElement("ha-icon");
    moreInfoIcon.icon = "mdi:information-outline";
    moreInfo.appendChild(moreInfoIcon);
    moreInfo.onclick = () => {
      this._dialog.open = false;
      const event = new Event("hass-more-info", {
        bubbles: true,
        cancelable: false,
        composed: true,
      });
      event.detail = { entityId: this._dialog._entity };
      this.dispatchEvent(event);
    };
    this._dialog.appendChild(moreInfo);
    this._dialog.appendChild(header);
  }

  _createDialogRow(range, index) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      color: "var(--primary-text-color)",
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      alignItems: "center",
      padding: "12px 14px",
      borderRadius: "12px",
      border: "1px solid var(--divider-color)",
      transition: "transform 0.15s ease, box-shadow 0.15s ease",
    });
    row.addEventListener("mouseenter", () => {
      row.style.transform = "translateY(-1px)";
      row.style.boxShadow = "0 4px 12px rgba(0,0,0,0.07)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.transform = "";
      row.style.boxShadow = "";
    });

    const timesGroup = document.createElement("div");
    Object.assign(timesGroup.style, {
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
      flex: "1",
      minWidth: "0",
    });
    this._createTimeInput(range, "from", timesGroup);
    const arrow = document.createElement("ha-icon");
    arrow.icon = "mdi:arrow-right-thick";
    arrow.style.color = "var(--secondary-text-color)";
    timesGroup.appendChild(arrow);
    this._createTimeInput(range, "to", timesGroup);
    row.appendChild(timesGroup);

    const controls = document.createElement("div");
    Object.assign(controls.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginInlineStart: "auto",
    });

    const toggle = document.createElement("ha-switch");
    toggle.checked = !range.disabled;
    toggle.addEventListener("change", () => {
      range.disabled = !range.disabled;
      this._saveBackendEntity();
    });
    controls.appendChild(toggle);

    const remove = document.createElement("ha-icon");
    remove.icon = "mdi:delete-outline";
    Object.assign(remove.style, {
      cursor: "pointer",
      color: "var(--error-color, #d32f2f)",
      padding: "5px",
      borderRadius: "50%",
      transition: "background 0.15s ease",
    });
    remove.addEventListener("mouseenter", () => {
      remove.style.background = "rgba(211,47,47,0.1)";
    });
    remove.addEventListener("mouseleave", () => {
      remove.style.background = "";
    });
    remove.onclick = () => {
      this._dialog._schedule = this._dialog._schedule.filter((_, i) => i !== index);
      this._createDialogRows();
      this._saveBackendEntity();
    };
    controls.appendChild(remove);
    row.appendChild(controls);

    return row;
  }

  _createTimeInput(range, type, row) {
    const sunrise = "↑";
    const sunset = "↓";
    const time_input = document.createElement("INPUT");
    const type_symbol = document.createElement("ha-icon");

    if (
      range[type] &&
      (range[type][0] === sunrise || range[type][0] === sunset)
    ) {
      this._setInputType(
        range[type][0] === sunrise ? "sunrise" : "sunset",
        type_symbol,
        time_input,
        range[type].slice(1),
      );
    } else {
      this._setInputType("time", type_symbol, time_input, range[type]);
    }

    Object.assign(type_symbol.style, {
      cursor: "pointer",
      color: "var(--primary-color)",
      padding: "4px",
      borderRadius: "6px",
      transition: "background 0.15s ease",
    });
    type_symbol.addEventListener("mouseenter", () => {
      type_symbol.style.background = "rgba(var(--rgb-primary-color, 3,169,244), 0.1)";
    });
    type_symbol.addEventListener("mouseleave", () => {
      type_symbol.style.background = "";
    });
    type_symbol.onclick = () => {
      if (type_symbol._type === "time") {
        this._setInputType("sunrise", type_symbol, time_input, null);
      } else if (type_symbol._type === "sunrise") {
        this._setInputType("sunset", type_symbol, time_input, null);
      } else {
        this._setInputType("time", type_symbol, time_input, null);
      }
      time_input.onchange();
    };

    Object.assign(time_input.style, {
      minWidth: `${this._input_time_width}px`,
      boxSizing: "border-box",
      padding: "6px 8px",
      border: "1.5px solid var(--divider-color)",
      borderRadius: "8px",
      background: "var(--input-fill-color, transparent)",
      color: "var(--primary-text-color)",
      fontSize: "14px",
      transition: "border-color 0.15s ease, box-shadow 0.15s ease",
      cursor: "pointer",
      outline: "none",
    });
    time_input.addEventListener("focus", () => {
      time_input.style.borderColor = "var(--primary-color)";
      time_input.style.boxShadow = "0 0 0 2px rgba(var(--rgb-primary-color, 3,169,244), 0.15)";
    });
    time_input.addEventListener("blur", () => {
      time_input.style.borderColor = "var(--divider-color)";
      time_input.style.boxShadow = "";
    });

    time_input.onchange = () => {
      if (!time_input.value) {
        range[type] = null;
        this._saveBackendEntity();
        return;
      }
      let value;
      if (type_symbol._type === "time") {
        value = `${time_input.value}:00`;
      } else {
        value = type_symbol._type === "sunrise" ? sunrise : sunset;
        if (time_input.value) {
          const value_int = parseInt(time_input.value, 10);
          if (value_int) {
            value += `${value_int > 0 ? "+" : ""}${time_input.value}`;
          }
        }
      }
      if (range[type] !== value) {
        range[type] = value;
        this._saveBackendEntity();
      }
    };

    const fieldGroup = document.createElement("div");
    Object.assign(fieldGroup.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
    });
    fieldGroup.appendChild(type_symbol);
    fieldGroup.appendChild(time_input);
    row.appendChild(fieldGroup);
  }

  _setInputType(type, symbol, input, value) {
    symbol._type = type;
    if (type === "sunrise" || type === "sunset") {
      input.type = "number";
      input.value = parseInt(value || "0", 10);
      symbol.icon = type === "sunrise" ? "mdi:weather-sunny" : "mdi:weather-night";
    } else {
      input.type = "time";
      if (value) {
        const time = value.split(":");
        input.value = `${time[0]}:${time[1]}`;
      } else if (input.value) {
        input.value = null;
      }
      symbol.icon = "mdi:clock-outline";
    }
  }

  _getInputTimeWidth() {
    if (!this._input_time_width) {
      const dummyInput = document.createElement("INPUT");
      dummyInput.type = "time";
      dummyInput.style.visibility = "hidden";
      this.appendChild(dummyInput);
      setTimeout(() => {
        this._input_time_width = Math.max(dummyInput.getBoundingClientRect().width, 110);
        dummyInput.remove();
      }, 0);
    }
  }

  _saveBackendEntity() {
    const schedule = this._dialog._schedule || [];
    for (const range of schedule) {
      if (range.from === null || range.to === null) {
        if (this._dialog._message.innerText !== "Missing field(s).") {
          this._dialog._message.innerText = "Missing field(s).";
          this._dialog._message.style.display = "block";
        }
        return;
      }
    }
    this._hass
      .callService("daily_schedule", "set", {
        entity_id: this._dialog._entity,
        schedule,
      })
      .then(() => {
        if (this._dialog._message.innerText.length > 0) {
          this._dialog._message.innerText = "";
          this._dialog._message.style.display = "none";
        }
      })
      .catch((error) => {
        if (this._dialog._message.innerText !== error.message) {
          this._dialog._message.innerText = error.message;
          this._dialog._message.style.display = "block";
        }
      });
  }
}

function _register(elementTag, className) {
  if (!customElements.get(elementTag)) {
    customElements.define(elementTag, className);
  }
}
_register("daily-schedule-card", DailyScheduleCard);
customElements
  .whenDefined("home-assistant")
  .then(() => _register("daily-schedule-card", DailyScheduleCard));
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "daily-schedule-card")) {
  window.customCards.push({
    type: "daily-schedule-card",
    name: "Daily Schedule",
    description: "Card for displaying and editing Daily Schedule entities.",
    documentationURL: "https://github.com/amitfin/lovelace-daily-schedule-card",
  });
}
