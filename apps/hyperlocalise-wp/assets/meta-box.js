(function () {
    "use strict";

    var config = window.hyperlocaliseMetaBox;
    var apiFetch = window.wp && window.wp.apiFetch;
    if (!config || !apiFetch) {
        return;
    }

    function showMessage(panel, text, isError) {
        var message = panel.querySelector(".hyperlocalise-panel__message");
        if (!message) {
            return;
        }
        message.hidden = !text;
        message.textContent = text || "";
        message.classList.toggle("hyperlocalise-panel__message--error", Boolean(isError));
    }

    function setBusy(panel, busy) {
        panel.classList.toggle("is-busy", busy);
        panel.querySelectorAll("[data-hyperlocalise-action]").forEach(function (button) {
            if (busy) {
                button.dataset.wasDisabled = button.disabled ? "1" : "";
                button.disabled = true;
            } else {
                button.disabled = button.dataset.wasDisabled === "1";
            }
        });
    }

    function render(panel, data) {
        var body = panel.querySelector(".hyperlocalise-panel__body");
        if (body && data && typeof data.panel === "string") {
            body.innerHTML = data.panel;
        }
    }

    function run(panel, action) {
        var postId = panel.dataset.postId;
        setBusy(panel, true);
        showMessage(panel, config.workingLabel, false);

        apiFetch({
            path: "/" + config.namespace + "/posts/" + postId + "/" + action,
            method: "POST",
            parse: false,
        })
            .then(function (response) {
                return response.json().then(function (data) {
                    return { ok: response.ok, data: data };
                });
            })
            .catch(function (error) {
                if (error && typeof error.json === "function") {
                    return error.json().then(function (data) {
                        return { ok: false, data: data };
                    });
                }
                return { ok: false, data: null };
            })
            .then(function (result) {
                render(panel, result.data);
                var text = result.data && result.data.message;
                showMessage(panel, text || (result.ok ? "" : config.failedLabel), !result.ok);
                setBusy(panel, false);
            });
    }

    document.addEventListener("click", function (event) {
        var button = event.target.closest("[data-hyperlocalise-action]");
        if (!button || button.disabled) {
            return;
        }
        var panel = button.closest(".hyperlocalise-panel");
        if (!panel) {
            return;
        }
        event.preventDefault();
        run(panel, button.dataset.hyperlocaliseAction);
    });
})();
