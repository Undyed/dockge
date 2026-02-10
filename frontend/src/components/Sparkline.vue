<template>
    <div class="sparkline-container" @mouseleave="hoverIndex = -1">
        <svg 
            :width="width" 
            :height="height" 
            class="sparkline" 
            :viewBox="`0 0 ${width} ${height}`"
            @mousemove="onMouseMove"
        >
            <!-- Area background -->
            <path
                v-if="points.length > 1"
                :d="areaPath"
                :fill="`url(#gradient-${color})`"
                class="area"
            />
            <!-- Line -->
            <path
                v-if="points.length > 1"
                :d="linePath"
                fill="none"
                :stroke="colorHex"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />

            <!-- Hover vertical line and dot -->
            <g v-if="hoverIndex !== -1 && points[hoverIndex]">
                <line 
                    :x1="points[hoverIndex].x" 
                    :y1="0" 
                    :x2="points[hoverIndex].x" 
                    :y2="height" 
                    stroke="rgba(0,0,0,0.1)" 
                    stroke-width="1"
                />
                <circle 
                    :cx="points[hoverIndex].x" 
                    :cy="points[hoverIndex].y" 
                    r="4" 
                    :fill="colorHex" 
                    stroke="white" 
                    stroke-width="2" 
                />
            </g>
            
            <!-- Gradients -->
            <defs>
                <linearGradient :id="`gradient-${color}`" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" :stop-color="colorHex" stop-opacity="0.3" />
                    <stop offset="100%" :stop-color="colorHex" stop-opacity="0" />
                </linearGradient>
            </defs>
        </svg>

        <!-- Tooltip -->
        <div 
            v-if="hoverIndex !== -1 && points[hoverIndex]" 
            class="sparkline-tooltip"
            :style="tooltipStyle"
        >
            {{ formattedValue }}
        </div>
    </div>
</template>

<script>
export default {
    props: {
        data: {
            type: Array,
            required: true,
        },
        width: {
            type: Number,
            default: 120,
        },
        height: {
            type: Number,
            default: 30,
        },
        color: {
            type: String,
            default: "primary", // primary, success, danger, warning
        },
        max: {
            type: Number,
            default: 0, // 0 means auto-scale
        },
        suffix: {
            type: String,
            default: "",
        },
        // Optional value formatting (e.g. for bytes)
        formatValue: {
            type: Function,
            default: null,
        }
    },
    data() {
        return {
            hoverIndex: -1,
        };
    },
    computed: {
        effectiveMax() {
            if (this.max > 0) return this.max;
            const dataMax = Math.max(...this.data, 0);
            return dataMax > 0 ? dataMax * 1.1 : 1; // Add 10% headroom
        },
        colorHex() {
            const colors = {
                primary: "#007bff",
                success: "#28a745",
                danger: "#dc3545",
                warning: "#ffc107",
                info: "#17a2b8",
                secondary: "#6c757d",
            };
            return colors[this.color] || colors.primary;
        },
        step() {
            return this.width / (Math.max(this.data.length - 1, 1));
        },
        points() {
            if (!this.data || this.data.length === 0) return [];
            
            const max = this.effectiveMax;
            return this.data.map((item, i) => {
                const isObj = typeof item === "object" && item !== null;
                const val = isObj ? item.value : item;
                const label = isObj ? item.label : null;
                
                return {
                    x: i * this.step,
                    y: this.height - (val / max) * this.height,
                    value: val,
                    label: label,
                };
            });
        },
        linePath() {
            if (this.points.length < 2) return "";
            return `M ${this.points.map(p => `${p.x},${p.y}`).join(" L ")}`;
        },
        areaPath() {
            if (this.points.length < 2) return "";
            const last = this.points[this.points.length - 1];
            return `${this.linePath} L ${last.x},${this.height} L 0,${this.height} Z`;
        },
        formattedValue() {
            if (this.hoverIndex === -1 || !this.points[this.hoverIndex]) return "";
            const p = this.points[this.hoverIndex];
            
            if (p.label) return p.label;
            
            const val = p.value;
            if (this.formatValue) return this.formatValue(val);
            return val.toFixed(2) + this.suffix;
        },
        tooltipStyle() {
            if (this.hoverIndex === -1 || !this.points[this.hoverIndex]) return {};
            const p = this.points[this.hoverIndex];
            
            // Try to keep tooltip inside bounds
            const isLeft = p.x > this.width / 2;
            
            return {
                left: `${p.x}px`,
                top: `${p.y - 10}px`,
                transform: `translate(${isLeft ? "-105%" : "5%"}, -50%)`,
                backgroundColor: this.colorHex,
            };
        }
    },
    methods: {
        onMouseMove(e) {
            const svg = e.currentTarget;
            const rect = svg.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            const index = Math.round(x / this.step);
            if (index >= 0 && index < this.data.length) {
                this.hoverIndex = index;
            } else {
                this.hoverIndex = -1;
            }
        }
    }
}
</script>

<style scoped>
.sparkline-container {
    position: relative;
    display: inline-block;
    cursor: crosshair;
}
.sparkline {
    display: block;
    overflow: visible;
}
.area {
    transition: d 0.3s ease;
}
.sparkline-tooltip {
    position: absolute;
    padding: 2px 6px;
    border-radius: 4px;
    color: white;
    font-size: 10px;
    font-weight: bold;
    pointer-events: none;
    white-space: nowrap;
    z-index: 100;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    transition: all 0.1s ease-out;
}
</style>
