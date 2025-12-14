<template>
    <div class="code-editor-wrapper" :class="{ 'read-only': readonly }">
        <Codemirror
            v-model="modelValue"
            :style="editorStyle"
            :autofocus="autofocus"
            :indent-with-tab="true"
            :tab-size="2"
            :extensions="computedExtensions"
            :disabled="readonly"
            @ready="handleReady"
            @change="handleChange"
            @focus="$emit('focus', $event)"
            @blur="$emit('blur', $event)"
        />
    </div>
</template>

<script lang="ts">
import { defineComponent, computed, shallowRef, watch, type PropType } from "vue";
import { Codemirror } from "vue-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { javascript } from "@codemirror/lang-javascript";
import { EditorView } from "@codemirror/view";
import { Extension } from "@codemirror/state";

// 浅色主题
const lightTheme = EditorView.theme({
    "&": {
        backgroundColor: "#ede9e4",
        color: "#2c3e50",
    },
    ".cm-content": {
        caretColor: "#0066cc",
    },
    ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "#0066cc",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "rgba(0, 102, 204, 0.3)",
    },
    ".cm-gutters": {
        backgroundColor: "#e5e1dc",
        color: "#8492a6",
        borderRight: "1px solid #ddd8d1",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "#ddd8d1",
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(0, 102, 204, 0.05)",
    },
    ".cm-line": {
        padding: "0 4px",
    },
}, { dark: false });

// 深色主题
const darkTheme = EditorView.theme({
    "&": {
        backgroundColor: "#22272e",
        color: "#c9d1d9",
    },
    ".cm-content": {
        caretColor: "#74c2ff",
    },
    ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "#74c2ff",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: "rgba(116, 194, 255, 0.3)",
    },
    ".cm-gutters": {
        backgroundColor: "#1c2128",
        color: "#6e7681",
        borderRight: "1px solid #30363d",
    },
    ".cm-activeLineGutter": {
        backgroundColor: "#30363d",
    },
    ".cm-activeLine": {
        backgroundColor: "rgba(116, 194, 255, 0.1)",
    },
    ".cm-line": {
        padding: "0 4px",
    },
}, { dark: true });

// 浅色主题语法高亮
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const lightHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "#d73a49" },
    { tag: tags.comment, color: "#6a737d", fontStyle: "italic" },
    { tag: tags.string, color: "#0d7377" },
    { tag: tags.number, color: "#c7254e" },
    { tag: tags.bool, color: "#c7254e" },
    { tag: tags.null, color: "#c7254e" },
    { tag: tags.propertyName, color: "#005cc5" },
    { tag: tags.variableName, color: "#e36209" },
    { tag: tags.function(tags.variableName), color: "#6f42c1" },
    { tag: tags.operator, color: "#6f42c1" },
    { tag: tags.punctuation, color: "#5a6c7d" },
    { tag: tags.definition(tags.propertyName), color: "#005cc5" },
    { tag: tags.atom, color: "#c7254e" },
]);

const darkHighlightStyle = HighlightStyle.define([
    { tag: tags.keyword, color: "#ff7b72" },
    { tag: tags.comment, color: "#8b949e", fontStyle: "italic" },
    { tag: tags.string, color: "#a5d6ff" },
    { tag: tags.number, color: "#79c0ff" },
    { tag: tags.bool, color: "#79c0ff" },
    { tag: tags.null, color: "#79c0ff" },
    { tag: tags.propertyName, color: "#7ee787" },
    { tag: tags.variableName, color: "#ffa657" },
    { tag: tags.function(tags.variableName), color: "#d2a8ff" },
    { tag: tags.operator, color: "#ff7b72" },
    { tag: tags.punctuation, color: "#c9d1d9" },
    { tag: tags.definition(tags.propertyName), color: "#7ee787" },
    { tag: tags.atom, color: "#79c0ff" },
]);

export type LanguageType = "yaml" | "javascript" | "env" | "text";

export default defineComponent({
    name: "CodeEditor",
    components: {
        Codemirror,
    },
    props: {
        modelValue: {
            type: String,
            default: "",
        },
        language: {
            type: String as PropType<LanguageType>,
            default: "text",
        },
        readonly: {
            type: Boolean,
            default: false,
        },
        autofocus: {
            type: Boolean,
            default: false,
        },
        height: {
            type: String,
            default: "300px",
        },
        lineNumbers: {
            type: Boolean,
            default: true,
        },
    },
    emits: ["update:modelValue", "change", "focus", "blur", "ready"],
    setup(props, { emit }) {
        const view = shallowRef<EditorView>();

        // 获取当前主题
        const isDark = computed(() => {
            return document.body.classList.contains("dark");
        });

        // 语言扩展
        const languageExtension = computed(() => {
            switch (props.language) {
                case "yaml":
                    return yaml();
                case "javascript":
                    return javascript();
                case "env":
                    // ENV 文件使用简单的文本模式
                    return [];
                default:
                    return [];
            }
        });

        // 基础扩展
        const baseExtensions = computed((): Extension[] => {
            const exts: Extension[] = [];

            // 行号
            if (props.lineNumbers) {
                exts.push(EditorView.lineWrapping);
            }

            return exts;
        });

        // 主题扩展
        const themeExtensions = computed((): Extension[] => {
            if (isDark.value) {
                return [darkTheme, syntaxHighlighting(darkHighlightStyle)];
            } else {
                return [lightTheme, syntaxHighlighting(lightHighlightStyle)];
            }
        });

        // 合并所有扩展
        const computedExtensions = computed((): Extension[] => {
            const langExt = languageExtension.value;
            return [
                ...baseExtensions.value,
                ...themeExtensions.value,
                ...(Array.isArray(langExt) ? langExt : [langExt]),
            ];
        });

        // 编辑器样式
        const editorStyle = computed(() => ({
            height: props.height,
            fontSize: "14px",
            fontFamily: "'JetBrains Mono', 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
        }));

        const handleReady = (payload: { view: EditorView }) => {
            view.value = payload.view;
            emit("ready", payload);
        };

        const handleChange = (value: string) => {
            emit("update:modelValue", value);
            emit("change", value);
        };

        // 监听主题变化，强制重新渲染
        watch(isDark, () => {
            // 主题变化时，扩展会自动更新
        });

        return {
            view,
            computedExtensions,
            editorStyle,
            handleReady,
            handleChange,
        };
    },
});
</script>

<style lang="scss" scoped>
.code-editor-wrapper {
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--border-color, #ddd8d1);

    &.read-only {
        opacity: 0.8;
    }

    :deep(.cm-editor) {
        height: 100%;

        &.cm-focused {
            outline: none;
        }
    }

    :deep(.cm-scroller) {
        overflow: auto;
    }

    :deep(.cm-gutters) {
        min-width: 3rem;
    }
}

// 深色主题
.dark .code-editor-wrapper {
    border-color: #30363d;
}
</style>
