<template>
    <div v-if="isEditMode" class="custom-file-editor">
        <h4 class="mb-3">{{ $t("customFiles") }}</h4>

        <!-- File selector -->
        <div class="shadow-box big-padding mb-3">
            <div class="mb-3">
                <label class="form-label">{{ $t("selectOrEnterFile") }}</label>
                <div class="input-group">
                    <select v-model="selectedFile" class="form-select" @change="loadSelectedFile">
                        <option value="">{{ $t("selectFile") }}</option>
                        <option v-for="file in fileList" :key="file.name" :value="file.name">
                            {{ file.name }}{{ file.size ? " (" + formatFileSize(file.size) + ")" : "" }}
                        </option>
                    </select>
                    <button class="btn btn-success" @click="showCustomInput = !showCustomInput">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("create") }}
                    </button>
                    <button class="btn btn-primary" :disabled="!selectedFile || isLoading" @click="loadFile">
                        <font-awesome-icon :icon="isLoading ? 'spinner' : 'edit'" :spin="isLoading" class="me-1" />
                        {{ $t("edit") }}
                    </button>
                    <button class="btn btn-danger" :disabled="!selectedFile || isLoading" @click="confirmDelete">
                        <font-awesome-icon icon="trash" class="me-1" />
                        {{ $t("delete") }}
                    </button>
                    <button class="btn btn-secondary" :disabled="isLoading" @click="loadFileList">
                        <font-awesome-icon :icon="isLoading ? 'spinner' : 'arrows-rotate'" :spin="isLoading" class="me-1" />
                        {{ $t("refresh") }}
                    </button>
                </div>
            </div>

            <!-- Custom file path input -->
            <div v-if="showCustomInput" class="mb-3">
                <label class="form-label">{{ $t("customFilePath") }}</label>
                <div class="input-group">
                    <input
                        v-model="customFilePath"
                        type="text"
                        class="form-control"
                        :placeholder="$t('enterFilePath')"
                        :disabled="isLoading"
                        @keyup.enter="loadCustomFile"
                    />
                    <button class="btn btn-success" :disabled="!customFilePath || isLoading" @click="createNewFile">
                        <font-awesome-icon icon="plus" class="me-1" />
                        {{ $t("create") }}
                    </button>
                    <button class="btn btn-primary" :disabled="!customFilePath || isLoading" @click="loadCustomFile">
                        <font-awesome-icon :icon="isLoading ? 'spinner' : 'edit'" :spin="isLoading" class="me-1" />
                        {{ $t("edit") }}
                    </button>
                </div>
                <div class="form-text">{{ $t("relativeToStackDir") }}</div>
            </div>
        </div>

        <!-- File Editor Modal -->
        <BModal
            v-model="showEditor"
            :title="currentFile || $t('fileEditor')"
            size="xl"
            :cancel-title="$t('close')"
            :ok-title="$t('saveFile')"
            @ok="saveFile"
            @cancel="closeFile"
        >
            <div v-if="currentFile" class="file-editor-modal">
                <div class="mb-3 d-flex justify-content-between align-items-center">
                    <div>
                        <strong>{{ $t("file") }}:</strong> {{ currentFile }}
                        <span v-if="fileSize" class="text-muted ms-2">({{ formatFileSize(fileSize) }})</span>
                    </div>
                    <div v-if="isLargeFile" class="text-warning">
                        <font-awesome-icon icon="exclamation-circle" class="me-1" />
                        {{ $t("largeFileWarning") }}
                    </div>
                </div>

                <!-- Loading indicator -->
                <div v-if="isLoading" class="text-center py-5">
                    <font-awesome-icon icon="spinner" spin size="2x" />
                    <p class="mt-3">{{ $t("loading") }}...</p>
                </div>

                <!-- Editor -->
                <div v-else class="editor-container">
                    <textarea
                        v-if="usePlainTextEditor"
                        v-model="fileContent"
                        class="plain-text-editor"
                        spellcheck="false"
                    ></textarea>
                    <CodeEditor
                        v-else
                        v-model="fileContent"
                        language="javascript"
                        height="500px"
                    />
                </div>
            </div>
        </BModal>

        <Confirm ref="confirmDelete" :title="$t('deleteFile')" @yes="deleteFile">
            {{ $t("deleteFileMsg", [selectedFile]) }}
        </Confirm>
    </div>
</template>

<script>
import { FontAwesomeIcon } from "@fortawesome/vue-fontawesome";
import { BModal } from "bootstrap-vue-next";
import CodeEditor from "./CodeEditor.vue";
import Confirm from "./Confirm.vue";

export default {
    name: "CustomFileEditor",
    components: {
        FontAwesomeIcon,
        BModal,
        CodeEditor,
        Confirm,
    },
    props: {
        stackName: {
            type: String,
            required: true,
        },
        endpoint: {
            type: String,
            default: "",
        },
        isEditMode: {
            type: Boolean,
            default: false,
        },
    },
    data() {
        return {
            fileList: [],
            selectedFile: "",
            customFilePath: "",
            showCustomInput: false,
            currentFile: "",
            fileContent: "",
            showEditor: false,
            isLoading: false,
            fileSize: 0,
            highlightDebounceTimer: null,
        };
    },
    computed: {
        // 文件大小超过 500KB 视为大文件
        isLargeFile() {
            return this.fileSize > 500 * 1024;
        },
        // 文件大小超过 1MB 使用纯文本编辑器
        usePlainTextEditor() {
            return this.fileSize > 1024 * 1024;
        },
    },
    watch: {
        isEditMode(newVal) {
            console.log("isEditMode changed:", newVal);
            if (newVal) {
                this.loadFileList();
            } else {
                this.closeFile();
            }
        },
        stackName(newVal) {
            console.log("stackName changed:", newVal);
            if (newVal && this.isEditMode) {
                this.loadFileList();
            }
        },
    },
    mounted() {
        console.log("CustomFileEditor mounted:", {
            stackName: this.stackName,
            endpoint: this.endpoint,
            isEditMode: this.isEditMode
        });
        if (this.isEditMode && this.stackName) {
            this.loadFileList();
        }
    },
    methods: {
        loadFileList() {
            if (!this.stackName) {
                console.warn("Cannot load file list: stackName is empty");
                return;
            }

            console.log("Loading file list for stack:", this.stackName, "endpoint:", this.endpoint);
            this.isLoading = true;
            this.$root.emitAgent(this.endpoint, "listStackFiles", this.stackName, (res) => {
                console.log("File list response:", res);
                this.isLoading = false;
                if (res.ok) {
                    this.fileList = res.files || [];
                    console.log("File list loaded:", this.fileList);
                } else {
                    console.error("Failed to load file list:", res);
                    this.$root.toastRes(res);
                }
            });
        },

        loadSelectedFile() {
            if (this.selectedFile) {
                this.customFilePath = this.selectedFile;
            }
        },

        loadFile() {
            if (!this.selectedFile) {
                return;
            }
            this.loadCustomFile();
        },

        loadCustomFile() {
            const filePath = this.customFilePath || this.selectedFile;
            if (!filePath) {
                this.$root.toastError(this.$t("pleaseEnterFilePath"));
                return;
            }

            console.log("Loading file:", filePath, "for stack:", this.stackName);
            this.isLoading = true;

            this.$root.emitAgent(this.endpoint, "readCustomFile", this.stackName, filePath, (res) => {
                console.log("Read file response:", res);
                this.isLoading = false;

                if (res.ok) {
                    this.currentFile = res.filePath;
                    this.fileContent = res.content;
                    this.selectedFile = res.filePath;
                    this.fileSize = res.size || new Blob([res.content]).size;
                    this.showEditor = true;

                    // 大文件警告
                    if (this.usePlainTextEditor) {
                        this.$root.toastWarning(this.$t("largeFileUsePlainEditor"));
                    } else if (this.isLargeFile) {
                        this.$root.toastWarning(this.$t("largeFileWarning"));
                    }

                    console.log("File loaded successfully:", this.currentFile, "Size:", this.fileSize);
                } else {
                    this.$root.toastRes(res);
                }
            });
        },

        saveFile() {
            if (!this.currentFile) {
                return;
            }

            this.$root.emitAgent(this.endpoint, "saveCustomFile", this.stackName, this.currentFile, this.fileContent, (res) => {
                this.$root.toastRes(res);
                if (res.ok) {
                    this.loadFileList();
                }
            });
        },

        confirmDelete() {
            if (this.selectedFile) {
                this.$refs.confirmDelete.show();
            }
        },

        deleteFile() {
            if (!this.selectedFile) {
                return;
            }

            this.isLoading = true;
            this.$root.emitAgent(this.endpoint, "deleteCustomFile", this.stackName, this.selectedFile, (res) => {
                this.isLoading = false;
                this.$root.toastRes(res);
                if (res.ok) {
                    this.selectedFile = "";
                    this.loadFileList();
                }
            });
        },

        createNewFile() {
            if (!this.customFilePath) {
                this.$root.toastError(this.$t("pleaseEnterFilePath"));
                return;
            }

            // Create a new file with empty content
            this.currentFile = this.customFilePath;
            this.fileContent = "";
            this.selectedFile = this.customFilePath;
            this.showEditor = true;
            console.log("Created new file:", this.currentFile);
        },

        closeFile() {
            this.showEditor = false;
            this.currentFile = "";
            this.fileContent = "";
            this.selectedFile = "";
            this.customFilePath = "";
            this.fileSize = 0;
            this.isLoading = false;

            // 清理防抖定时器
            if (this.highlightDebounceTimer) {
                clearTimeout(this.highlightDebounceTimer);
                this.highlightDebounceTimer = null;
            }
        },

        formatFileSize(bytes) {
            if (bytes === 0) return "0 B";
            const k = 1024;
            const sizes = ["B", "KB", "MB", "GB"];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
        },
    },
};
</script>

<style scoped lang="scss">
@import "../styles/vars.scss";

.custom-file-editor {
    .file-editor-modal {
        .editor-container {
            border: 1px solid #dee2e6;
            border-radius: 0.375rem;
            overflow: hidden;
            background-color: $dark-bg2; // 默认深色背景

            // 浅色模式下的样式
            body:not(.dark) & {
                background-color: $light-bg2 !important;
                border-color: $light-border-color !important;
            }
        }

        .file-editor {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            min-height: 400px;
            max-height: 600px;
            overflow-y: auto;
        }

        .plain-text-editor {
            font-family: 'JetBrains Mono', monospace;
            font-size: 14px;
            min-height: 400px;
            max-height: 600px;
            width: 100%;
            padding: 1rem;
            border: none;
            outline: none;
            resize: vertical;
            background-color: $dark-bg2;
            color: $dark-font-color;
            line-height: 1.5;
            tab-size: 4;
            white-space: pre;
            overflow-wrap: normal;
            overflow-x: auto;

            // 浅色模式下的样式
            body:not(.dark) & {
                background-color: $light-bg2;
                color: $light-font-color;
            }

            &:focus {
                outline: none;
            }
        }
    }
}

// Global styles for modal
:deep(.modal-xl) {
    max-width: 90vw;
}

:deep(.modal-body) {
    padding: 1rem;
}
</style>
