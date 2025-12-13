import { defineComponent } from "vue";

export default defineComponent({
    data() {
        return {
            system: (window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light",
            userTheme: localStorage.theme,
            statusPageTheme: "light",
            forceStatusPageTheme: false,
            path: "",
        };
    },

    computed: {
        theme() {
            if (this.userTheme === "auto") {
                return this.system;
            }
            return this.userTheme;
        },

        isDark() {
            return this.theme === "dark";
        }
    },

    watch: {
        "$route.fullPath"(path) {
            this.path = path;
        },

        userTheme(to, from) {
            localStorage.theme = to;
        },

        styleElapsedTime(to, from) {
            localStorage.styleElapsedTime = to;
        },

        theme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.theme);
            this.updateThemeColorMeta();
            this.updateCaretColor();
        },

        userHeartbeatBar(to, from) {
            localStorage.heartbeatBarTheme = to;
        },

        heartbeatBarTheme(to, from) {
            document.body.classList.remove(from);
            document.body.classList.add(this.heartbeatBarTheme);
        }
    },

    mounted() {
        // Default Auto (follows system preference)
        if (! this.userTheme) {
            this.userTheme = "auto";
        }

        document.body.classList.add(this.theme);
        this.updateThemeColorMeta();
        this.updateCaretColor();
    },

    methods: {
        /**
         * Update the theme color meta tag
         * @returns {void}
         */
        updateThemeColorMeta() {
            if (this.theme === "dark") {
                document.querySelector("#theme-color")?.setAttribute("content", "#161B22");
            } else {
                // 使用护眼的米色作为浅色主题的元标签颜色
                document.querySelector("#theme-color")?.setAttribute("content", "#f5f3f0");
            }
        },

        /**
         * Update caret color for light theme
         * @returns {void}
         */
        updateCaretColor() {
            // 动态添加样式确保光标在浅色主题下可见
            const styleId = "dynamic-caret-style";
            let styleEl = document.getElementById(styleId) as HTMLStyleElement;

            if (!styleEl) {
                styleEl = document.createElement("style");
                styleEl.id = styleId;
                document.head.appendChild(styleEl);
            }

            const caretColor = this.theme === "dark" ? "#74c2ff" : "#0066cc";
            const selectionBg = this.theme === "dark" ? "rgba(116, 194, 255, 0.4)" : "rgba(0, 102, 204, 0.4)";

            // 通过 JavaScript 直接设置内联样式，修复光标不可见问题
            // 关键：textarea 需要在 editor 上面（z-index），editor 需要 pointer-events: none
            const applyCaretStyle = () => {
                document.querySelectorAll(".prism-editor__textarea").forEach((el) => {
                    const textarea = el as HTMLTextAreaElement;
                    textarea.style.setProperty("color", "transparent", "important");
                    textarea.style.setProperty("-webkit-text-fill-color", caretColor, "important");
                    textarea.style.setProperty("caret-color", caretColor, "important");
                    textarea.style.setProperty("z-index", "10", "important");
                    textarea.style.setProperty("position", "absolute", "important");
                    textarea.style.setProperty("background", "transparent", "important");
                });

                document.querySelectorAll(".prism-editor__editor").forEach((el) => {
                    const editor = el as HTMLElement;
                    editor.style.setProperty("z-index", "1", "important");
                    editor.style.setProperty("pointer-events", "none", "important");
                    editor.style.setProperty("position", "relative", "important");
                });
            };

            // 立即执行
            applyCaretStyle();
            // 延迟执行确保 DOM 已更新
            setTimeout(applyCaretStyle, 100);
            setTimeout(applyCaretStyle, 500);
            setTimeout(applyCaretStyle, 1000);

            // 监听 DOM 变化
            if (!(window as any).__caretObserver) {
                (window as any).__caretObserver = new MutationObserver(() => {
                    applyCaretStyle();
                });
                (window as any).__caretObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            }

            // CSS 样式用于选中高亮等
            styleEl.textContent = `
                .prism-editor__textarea::selection {
                    background-color: ${selectionBg} !important;
                }
                .prism-editor__textarea::-moz-selection {
                    background-color: ${selectionBg} !important;
                }
                ${this.theme !== "dark" ? `
                input, textarea:not(.prism-editor__textarea), .form-control {
                    caret-color: #0066cc !important;
                }
                ::selection {
                    background-color: rgba(0, 102, 204, 0.35) !important;
                }
                ` : ""}
            `;
        }
    }
});

