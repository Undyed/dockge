<template>
    <div class="shadow-box terminal-shell">
        <div v-if="showClipboardToolbar" class="shortcut-hint-row">
            <small class="shortcut-hint">
                {{ $t("terminalShortcutTips", [ interruptShortcutLabel, copyShortcutLabel, pasteShortcutLabel ]) }}
            </small>
        </div>
        <div v-pre ref="terminal" class="main-terminal"></div>
    </div>
</template>

<script>
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { TERMINAL_COLS, TERMINAL_ROWS } from "../../../common/util-common";

export default {
    /**
     * @type {Terminal}
     */
    terminal: null,
    components: {

    },
    props: {
        name: {
            type: String,
            required: true,
        },

        endpoint: {
            type: String,
            required: true,
        },

        // Require if mode is interactive
        stackName: {
            type: String,
            default: "",
        },

        // Require if mode is interactive
        serviceName: {
            type: String,
            default: "",
        },

        // Require if mode is interactive
        shell: {
            type: String,
            default: "bash",
        },

        rows: {
            type: Number,
            default: TERMINAL_ROWS,
        },

        cols: {
            type: Number,
            default: TERMINAL_COLS,
        },

        // Mode
        // displayOnly: Only display terminal output
        // mainTerminal: Allow input limited commands and output
        // interactive: Free input and output
        mode: {
            type: String,
            default: "displayOnly",
        }
    },
    emits: [ "has-data" ],
    data() {
        return {
            first: true,
            hasSelection: false,
            terminalInputBuffer: "",
            cursorPosition: 0,
        };
    },
    computed: {
        showClipboardToolbar() {
            return this.mode === "interactive";
        },
        interruptShortcutLabel() {
            return "Ctrl+C";
        },
        copyShortcutLabel() {
            return this.isMacPlatform() ? "Cmd+C" : "Ctrl+Shift+C";
        },
        pasteShortcutLabel() {
            return this.isMacPlatform() ? "Cmd+V" : "Ctrl+V";
        }
    },

    watch: {
        name() {
            this.bind();
        },
        endpoint() {
            this.bind();
        }
    },

    created() {

    },

    mounted() {
        let cursorBlink = true;

        if (this.mode === "displayOnly") {
            cursorBlink = false;
        }

        this.terminal = new Terminal({
            fontSize: 14,
            fontFamily: "'JetBrains Mono', monospace",
            cursorBlink,
            cols: this.cols,
            rows: this.rows,
        });

        if (this.mode === "mainTerminal") {
            this.mainTerminalConfig();
        } else if (this.mode === "interactive") {
            this.interactiveTerminalConfig();
        }

        //this.terminal.loadAddon(new WebLinksAddon());

        // Bind to a div
        this.terminal.open(this.$refs.terminal);
        this.terminal.focus();

        // Notify parent component when data is received
        this.terminal.onCursorMove(() => {
            console.debug("onData triggered");
            if (this.first) {
                this.$emit("has-data");
                this.first = false;
            }
        });
        this.terminal.onSelectionChange(() => {
            this.hasSelection = this.terminal.hasSelection();
        });

        this.bind();

        // Create a new Terminal
        if (this.mode === "mainTerminal") {
            this.$root.emitAgent(this.endpoint, "mainTerminal", this.name, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                }
            });
        } else if (this.mode === "interactive") {
            console.debug("Create Interactive terminal:", this.name);
            this.$root.emitAgent(this.endpoint, "interactiveTerminal", this.stackName, this.serviceName, this.shell, (res) => {
                if (!res.ok) {
                    this.$root.toastRes(res);
                }
            });
        }
        // Fit the terminal width to the div container size after terminal is created.
        this.updateTerminalSize();
    },

    unmounted() {
        window.removeEventListener("resize", this.onResizeEvent); // Remove the resize event listener from the window object.
        this.$root.unbindTerminal(this.name);
        this.terminal.dispose();
    },

    methods: {
        bind(endpoint, name) {
            // Workaround: normally this.name should be set, but it is not sometimes, so we use the parameter, but eventually this.name and name must be the same name
            if (name) {
                this.$root.unbindTerminal(name);
                this.$root.bindTerminal(endpoint, name, this.terminal);
                console.debug("Terminal bound via parameter: " + name);
            } else if (this.name) {
                this.$root.unbindTerminal(this.name);
                this.$root.bindTerminal(this.endpoint, this.name, this.terminal);
                console.debug("Terminal bound: " + this.name);
            } else {
                console.debug("Terminal name not set");
            }
        },

        removeInput() {
            const backspaceCount = this.terminalInputBuffer.length;
            const backspaces = "\b \b".repeat(backspaceCount);
            this.cursorPosition = 0;
            this.terminal.write(backspaces);
            this.terminalInputBuffer = "";
        },

        mainTerminalConfig() {
            this.terminal.onKey(e => {
                const code = e.key.charCodeAt(0);
                console.debug("Encode: " + JSON.stringify(e.key));

                if (e.key === "\r") {
                    // Return if no input
                    if (this.terminalInputBuffer.length === 0) {
                        return;
                    }

                    const buffer = this.terminalInputBuffer;

                    // Remove the input from the terminal
                    this.removeInput();

                    this.$root.emitAgent(this.endpoint, "terminalInput", this.name, buffer + e.key, (err) => {
                        this.$root.toastError(err.msg);
                    });

                } else if (code === 127) { // Backspace
                    if (this.cursorPosition > 0) {
                        this.terminal.write("\b \b");
                        this.cursorPosition--;
                        this.terminalInputBuffer = this.terminalInputBuffer.slice(0, -1);
                    }
                } else if (e.key === "\u001B\u005B\u0041" || e.key === "\u001B\u005B\u0042") {      // UP OR DOWN
                    // Do nothing

                } else if (e.key === "\u001B\u005B\u0043") {      // RIGHT
                    // TODO
                } else if (e.key === "\u001B\u005B\u0044") {      // LEFT
                    // TODO
                } else if (e.key === "\u0003") {      // Ctrl + C
                    console.debug("Ctrl + C");
                    this.$root.emitAgent(this.endpoint, "terminalInput", this.name, e.key);
                    this.removeInput();
                } else {
                    this.cursorPosition++;
                    this.terminalInputBuffer += e.key;
                    this.terminal.write(e.key);
                }
            });
        },

        interactiveTerminalConfig() {
            this.terminal.attachCustomKeyEventHandler((event) => this.handleInteractiveShortcut(event));
            this.terminal.onData((data) => {
                this.$root.emitAgent(this.endpoint, "terminalInput", this.name, data, (res) => {
                    if (!res.ok) {
                        this.$root.toastRes(res);
                    }
                });
            });
        },

        isMacPlatform() {
            if (typeof navigator === "undefined") {
                return false;
            }

            let platform = navigator.platform || "";
            if (navigator.userAgentData?.platform) {
                platform = navigator.userAgentData.platform;
            }

            return /Mac|iPhone|iPad|iPod/i.test(platform);
        },

        handleInteractiveShortcut(event) {
            if (event.type !== "keydown" || this.mode !== "interactive") {
                return true;
            }

            const isMac = this.isMacPlatform();
            const key = event.key.toLowerCase();

            if (isMac && event.metaKey && !event.ctrlKey && !event.altKey && key === "c") {
                event.preventDefault();
                event.stopPropagation();

                if (this.hasSelection) {
                    void this.copySelection();
                }

                return false;
            }

            if (isMac && event.metaKey && !event.ctrlKey && !event.altKey && key === "v") {
                event.preventDefault();
                event.stopPropagation();
                void this.pasteFromClipboard();
                return false;
            }

            if (!isMac && event.ctrlKey && event.shiftKey && !event.altKey && key === "c") {
                event.preventDefault();
                event.stopPropagation();

                if (this.hasSelection) {
                    void this.copySelection();
                }

                return false;
            }

            if (!isMac && event.ctrlKey && !event.shiftKey && !event.altKey && key === "v") {
                event.preventDefault();
                event.stopPropagation();
                void this.pasteFromClipboard();
                return false;
            }

            return true;
        },

        async copySelection() {
            const selection = this.terminal.getSelection();
            if (!selection) {
                return;
            }

            try {
                await this.writeTextToClipboard(selection);
                this.terminal.focus();
            } catch (error) {
                console.error("Failed to write clipboard:", error);
                this.$root.toastError("ClipboardWriteFailed");
            }
        },

        async pasteFromClipboard() {
            try {
                if (!navigator.clipboard?.readText) {
                    throw new Error("navigator.clipboard.readText is unavailable");
                }

                const text = await navigator.clipboard.readText();
                if (text) {
                    this.terminal.paste(text);
                }
                this.terminal.focus();
            } catch (error) {
                console.error("Failed to read clipboard:", error);
                this.$root.toastError("ClipboardReadFailed");
            }
        },

        async writeTextToClipboard(text) {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return;
            }

            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();

            try {
                if (!document.execCommand("copy")) {
                    throw new Error("document.execCommand(copy) returned false");
                }
            } finally {
                document.body.removeChild(textarea);
            }
        },

        /**
         * Update the terminal size to fit the container size.
         *
         * If the terminalFitAddOn is not created, creates it, loads it and then fits the terminal to the appropriate size.
         * It then addes an event listener to the window object to listen for resize events and calls the fit method of the terminalFitAddOn.
         */
        updateTerminalSize() {
            if (!Object.hasOwn(this, "terminalFitAddOn")) {
                this.terminalFitAddOn = new FitAddon();
                this.terminal.loadAddon(this.terminalFitAddOn);
                window.addEventListener("resize", this.onResizeEvent);
            }
            this.terminalFitAddOn.fit();
            this.hasSelection = this.terminal.hasSelection();
        },
        /**
         * Handles the resize event of the terminal component.
         */
        onResizeEvent() {
            this.terminalFitAddOn.fit();
            let rows = this.terminal.rows;
            let cols = this.terminal.cols;
            this.$root.emitAgent(this.endpoint, "terminalResize", this.name, rows, cols);
        }
    }
};
</script>

<style scoped lang="scss">
.main-terminal {
    flex: 1;
    min-height: 0;
}

.terminal-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.shortcut-hint-row {
    display: flex;
    justify-content: flex-end;
    padding: 10px 12px 0;
}

.shortcut-hint {
    line-height: 1.4;
    padding: 6px 10px;
    border-radius: 999px;
    font-weight: 600;
    color: #d7f3ff;
    background: linear-gradient(135deg, rgba(0, 131, 176, 0.5), rgba(0, 79, 129, 0.7));
    border: 1px solid rgba(127, 219, 255, 0.45);
    box-shadow: 0 4px 14px rgba(0, 56, 92, 0.35);
}
</style>

<style lang="scss">
.terminal {
    background-color: black !important;
    height: 100%;
}
</style>
