<template>
    <div :class="classes">
        <div v-if="! $root.socketIO.connected && ! $root.socketIO.firstConnect" class="lost-connection">
            <div class="container-fluid">
                {{ $root.socketIO.connectionErrorMsg }}
                <div v-if="$root.socketIO.showReverseProxyGuide">
                    {{ $t("reverseProxyMsg1") }} <a href="https://github.com/louislam/uptime-kuma/wiki/Reverse-Proxy" target="_blank">{{ $t("reverseProxyMsg2") }}</a>
                </div>
            </div>
        </div>

        <!-- Desktop header -->
        <header v-if="! $root.isMobile" class="d-flex flex-wrap justify-content-center py-3 mb-3 border-bottom">
            <router-link to="/" class="d-flex align-items-center mb-3 mb-md-0 me-md-auto text-dark text-decoration-none">
                <object class="bi me-2 ms-4" width="40" height="40" data="/icon.svg" />
                <span class="fs-4 title">Dockge</span>
            </router-link>

            <a v-if="hasNewVersion" target="_blank" href="https://github.com/louislam/dockge/releases" class="btn btn-warning me-3">
                <font-awesome-icon icon="arrow-alt-circle-up" /> {{ $t("newUpdate") }}
            </a>

            <ul class="nav nav-pills">
                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/" class="nav-link">
                        <font-awesome-icon icon="home" /> {{ $t("home") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/status" class="nav-link">
                        <font-awesome-icon icon="chart-bar" /> {{ $t("status") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item me-2">
                    <router-link to="/console" class="nav-link">
                        <font-awesome-icon icon="terminal" /> {{ $t("console") }}
                    </router-link>
                </li>

                <li v-if="$root.loggedIn" class="nav-item">
                    <div class="dropdown dropdown-profile-pic">
                        <div class="nav-link" data-bs-toggle="dropdown">
                            <div class="profile-pic">{{ $root.usernameFirstChar }}</div>
                            <font-awesome-icon icon="angle-down" />
                        </div>

                        <!-- Header's Dropdown Menu -->
                        <ul class="dropdown-menu">
                            <!-- Username -->
                            <li>
                                <i18n-t v-if="$root.username != null" tag="span" keypath="signedInDisp" class="dropdown-item-text">
                                    <strong>{{ $root.username }}</strong>
                                </i18n-t>
                                <span v-if="$root.username == null" class="dropdown-item-text">{{ $t("signedInDispDisabled") }}</span>
                            </li>

                            <li><hr class="dropdown-divider"></li>

                            <!-- Functions -->

                            <!--<li>
                                <router-link to="/registry" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="warehouse" /> {{ $t("registry") }}
                                </router-link>
                            </li>-->

                            <li>
                                <button class="dropdown-item" @click="scanFolder">
                                    <font-awesome-icon icon="arrows-rotate" /> {{ $t("scanFolder") }}
                                </button>
                            </li>

                            <li>
                                <router-link to="/settings/general" class="dropdown-item" :class="{ active: $route.path.includes('settings') }">
                                    <font-awesome-icon icon="cog" /> {{ $t("Settings") }}
                                </router-link>
                            </li>

                            <li>
                                <button class="dropdown-item" @click="$root.logout">
                                    <font-awesome-icon icon="sign-out-alt" />
                                    {{ $t("Logout") }}
                                </button>
                            </li>
                        </ul>
                    </div>
                </li>
            </ul>
        </header>

        <main>
            <div v-if="$root.socketIO.connecting" class="container mt-5">
                <h4>{{ $t("connecting...") }}</h4>
            </div>

            <router-view v-if="$root.loggedIn" />
            <Login v-if="! $root.loggedIn && $root.allowLoginDialog" />
        </main>
    </div>
</template>

<script>
import Login from "../components/Login.vue";
import { compareVersions } from "compare-versions";
import { ALL_ENDPOINTS } from "../../../common/util-common";

export default {

    components: {
        Login,
    },

    data() {
        return {

        };
    },

    computed: {

        // Theme or Mobile
        classes() {
            const classes = {};
            classes[this.$root.theme] = true;
            classes["mobile"] = this.$root.isMobile;
            return classes;
        },

        hasNewVersion() {
            if (this.$root.info.latestVersion && this.$root.info.version) {
                return compareVersions(this.$root.info.latestVersion, this.$root.info.version) >= 1;
            } else {
                return false;
            }
        },

    },

    watch: {

    },

    mounted() {

    },

    beforeUnmount() {

    },

    methods: {
        scanFolder() {
            this.$root.emitAgent(ALL_ENDPOINTS, "requestStackList", (res) => {
                this.$root.toastRes(res);
            });
        },
    },

};
</script>

<style lang="scss" scoped>
@import "../styles/vars.scss";

// Header Styling
header {
    background-color: $light-header-bg;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);

    .dark & {
        background-color: rgba($dark-header-bg, 0.85);
        border-bottom-color: rgba(255, 255, 255, 0.1) !important;
        
        span {
            color: $dark-font-color2;
        }
    }
}

.nav-link {
    border-radius: $border-radius;
    transition: all 0.2s ease;
    padding: 0.5rem 1rem;
    font-weight: 500;

    &:hover {
        background-color: rgba(0,0,0,0.05);
        transform: translateY(-1px);
    }

    &.status-page {
        background-color: rgba(255, 255, 255, 0.1);
    }

    .dark & {
        color: $dark-font-color;
        &:hover {
            background-color: rgba(255,255,255,0.1);
            color: $dark-font-color2;
        }
    }
}

// Mobile Bottom Nav
.bottom-nav {
    z-index: 1000;
    position: fixed;
    bottom: 0;
    height: calc(65px + env(safe-area-inset-bottom));
    width: 100%;
    left: 0;
    background-color: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    box-shadow: 0 -5px 20px rgba(0, 0, 0, 0.05);
    text-align: center;
    white-space: nowrap;
    padding: 0 10px env(safe-area-inset-bottom);
    border-top: 1px solid rgba(0,0,0,0.05);

    .dark & {
        background-color: rgba($dark-bg, 0.9);
        border-top: 1px solid $dark-border-color;
    }

    a {
        text-align: center;
        width: 25%;
        display: inline-block;
        height: 100%;
        padding-top: 12px;
        font-size: 11px;
        color: $light-font-color3;
        overflow: hidden;
        text-decoration: none;
        transition: color 0.2s;

        &.router-link-exact-active, &.active {
            color: $primary;
            font-weight: 600;

            div {
                transform: scale(1.1);
            }
        }

        div {
            font-size: 22px;
            margin-bottom: 4px;
            transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .dark & {
            color: $dark-font-color3;
            &.router-link-exact-active, &.active {
                color: lighten($primary, 10%);
            }
        }
    }
}

main {
    min-height: calc(100vh - 160px);
}

.title {
    font-weight: 700;
    letter-spacing: -0.5px;
    background: $primary-gradient;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    display: inline-block;
    
    // Fallback for dark mode logo text if needed, but gradient usually works
}

.nav {
    margin-right: 25px;
}

.lost-connection {
    padding: 8px;
    background: linear-gradient(90deg, #ff6b6b, #ff8787);
    color: white;
    position: fixed;
    width: 100%;
    z-index: 99999;
    font-weight: 500;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

// Profile Pic Button with Dropdown
.dropdown-profile-pic {
    user-select: none;

    .nav-link {
        cursor: pointer;
        display: flex;
        gap: 8px;
        align-items: center;
        background-color: rgba(0, 0, 0, 0.03);
        padding: 0.4rem 0.6rem 0.4rem 0.4rem;
        border-radius: 2rem;
        border: 1px solid transparent;

        &:hover {
            background-color: white;
            border-color: rgba(0,0,0,0.05);
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
        }

        .dark & {
            background-color: rgba(255, 255, 255, 0.05);
            
            &:hover {
                background-color: rgba(255, 255, 255, 0.1);
                border-color: rgba(255,255,255,0.05);
                box-shadow: none;
            }
        }
    }

    .dropdown-menu {
        transition: opacity 0.2s, transform 0.2s;
        padding: 0.5rem;
        margin-top: 10px !important;
        border-radius: 1rem;
        overflow: hidden;
        border: none;
        box-shadow: 0 10px 40px rgba(0,0,0,0.15);
        animation: slideUp 0.2s ease-out;

        .dropdown-divider {
            margin: 0.5rem 0;
            border-top: 1px solid rgba(0, 0, 0, 0.05);
            opacity: 1;
        }

        .dropdown-item-text {
            font-size: 0.9rem;
            padding: 0.5rem 1rem;
            color: $light-font-color2;
        }

        .dropdown-item {
            padding: 0.6rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.95rem;
            
            &:hover {
                background-color: $highlight-white;
                color: $primary;
            }
        }

        .dark & {
            background-color: $dark-bg2;
            color: $dark-font-color;
            border: 1px solid $dark-border-color;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);

            .dropdown-divider {
                border-color: rgba(255,255,255,0.1);
            }

            .dropdown-item-text {
                color: $dark-font-color3;
                
                strong { color: $dark-font-color2; }
            }

            .dropdown-item {
                color: $dark-font-color;

                &.active {
                    color: white;
                    background: $primary-gradient !important;
                }

                &:hover {
                    background-color: rgba(255,255,255,0.05);
                    color: white;
                }
            }
        }
    }

    .profile-pic {
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        background: $primary-gradient;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-weight: 600;
        font-size: 0.85rem;
        box-shadow: 0 2px 5px rgba($primary, 0.3);
    }
}
</style>
