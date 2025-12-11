<template>
    <div>
        <div v-if="valid">
            <ul v-if="isArrayInited" class="list-group">
                <li v-for="(value, index) in array" :key="index" class="list-group-item">
                    <select v-model="array[index]" class="no-bg domain-input">
                        <option value="">{{ $t(`Select a network...`) }}</option>
                        <option v-for="option in options" :key="option" :value="option">{{ option }}</option>
                    </select>

                    <font-awesome-icon icon="times" class="action remove ms-2 me-3 text-danger" @click="remove(index)" />
                </li>
            </ul>

            <button class="btn btn-normal btn-sm mt-3" @click="addField">{{ $t("addListItem", [ displayName ]) }}</button>
        </div>
        <div v-else>
            Long syntax is not supported here. Please use the YAML editor.
        </div>
    </div>
</template>

<script>
export default {
    props: {
        name: {
            type: String,
            required: true,
        },
        placeholder: {
            type: String,
            default: "",
        },
        displayName: {
            type: String,
            required: true,
        },
        options: {
            type: Array,
            required: true,
        },
    },
    data() {
        return {

        };
    },
    computed: {
        array() {
            // Create the array if not exists, it should be safe.
            if (!this.service[this.name]) {
                return [];
            }
            return this.service[this.name];
        },

        /**
         * Check if the array is inited before called v-for.
         * Prevent empty arrays inserted to the YAML file.
         * @return {boolean}
         */
        isArrayInited() {
            return this.service[this.name] !== undefined;
        },

        service() {
            return this.$parent.$parent.service;
        },

        valid() {
            // Check if the array is actually an array
            if (!Array.isArray(this.array)) {
                return false;
            }

            // Check if the array contains non-object only.
            for (let item of this.array) {
                if (typeof item === "object") {
                    return false;
                }
            }
            return true;
        }

    },
    created() {

    },
    methods: {
        addField() {
            // Create the array if not exists.
            if (!this.service[this.name]) {
                this.service[this.name] = [];
            }
            this.array.push("");
        },
        remove(index) {
            this.array.splice(index, 1);
        },
    }
};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

.list-group {
    background-color: $dark-bg2;
    border: 1px solid $dark-border-color;
    border-radius: 10px;

    :global(body:not(.dark)) & {
        background-color: $light-bg;
        border-color: $light-border-color;
    }

    li {
        display: flex;
        align-items: center;
        padding: 10px 0 10px 10px;
        gap: 10px;
    }
}

.domain-input {
    flex-grow: 1;
    background-color: $dark-bg2;
    border: 1px solid $dark-border-color;
    color: $dark-font-color;
    outline: none;
    border-radius: 10px;
    padding: 8px 10px;
    caret-color: $primary;
    transition: border-color 0.2s $easing-in, box-shadow 0.2s $easing-in, background-color 0.2s $easing-in;

    &::placeholder {
        color: $dark-font-color3;
    }

    &:focus {
        border-color: $primary;
        box-shadow: 0 0 0 0.2rem rgba(116, 194, 255, 0.12);
        background-color: darken($dark-bg2, 2%);
    }

    &::selection {
        background-color: rgba(116, 194, 255, 0.35);
        color: $dark-font-color2;
    }

    :global(body:not(.dark)) & {
        background-color: $light-bg;
        border-color: $light-border-color;
        color: $light-font-color;
        caret-color: $primary;

        &::placeholder {
            color: $light-font-color3;
        }

        &:focus {
            background-color: #fdfdfc;
            border-color: $primary;
            box-shadow: 0 0 0 0.2rem rgba(116, 194, 255, 0.15);
        }

        &::selection {
            background-color: rgba(116, 194, 255, 0.35);
            color: $light-font-color;
        }
    }
}
</style>
