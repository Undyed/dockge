import { createRouter, createWebHistory } from "vue-router";

import Layout from "./layouts/Layout.vue";
import Setup from "./pages/Setup.vue";
import Dashboard from "./pages/Dashboard.vue";
import DashboardHome from "./pages/DashboardHome.vue";
import Console from "./pages/Console.vue";
import Compose from "./pages/Compose.vue";
import ContainerTerminal from "./pages/ContainerTerminal.vue";

const Settings = () => import("./pages/Settings.vue");

// Settings - Sub Pages
import Appearance from "./components/settings/Appearance.vue";
import General from "./components/settings/General.vue";
const Security = () => import("./components/settings/Security.vue");
import About from "./components/settings/About.vue";

const routes = [
    {
        path: "/empty",
        component: Layout,
        children: [
            {
                path: "",
                component: Dashboard,
                children: [
                    {
                        name: "DashboardHome",
                        path: "/",
                        component: DashboardHome,
                        meta: { title: "Dashboard" },
                        children: [
                            {
                                path: "/compose",
                                component: Compose,
                                meta: { title: "Create Stack" },
                            },
                            {
                                path: "/compose/:stackName/:endpoint",
                                component: Compose,
                                meta: { title: "Edit Stack" },
                            },
                            {
                                path: "/compose/:stackName",
                                component: Compose,
                                meta: { title: "Edit Stack" },
                            },
                            {
                                path: "/terminal/:stackName/:serviceName/:type",
                                component: ContainerTerminal,
                                name: "containerTerminal",
                                meta: { title: "Terminal" },
                            },
                            {
                                path: "/terminal/:stackName/:serviceName/:type/:endpoint",
                                component: ContainerTerminal,
                                name: "containerTerminalEndpoint",
                                meta: { title: "Terminal" },
                            },
                        ]
                    },
                    {
                        path: "/console",
                        component: Console,
                        meta: { title: "Console" },
                    },
                    {
                        path: "/console/:endpoint",
                        component: Console,
                        meta: { title: "Console" },
                    },
                    {
                        path: "/settings",
                        component: Settings,
                        meta: { title: "Settings" },
                        children: [
                            {
                                path: "general",
                                component: General,
                                meta: { title: "General Settings" },
                            },
                            {
                                path: "appearance",
                                component: Appearance,
                                meta: { title: "Appearance Settings" },
                            },
                            {
                                path: "security",
                                component: Security,
                                meta: { title: "Security Settings" },
                            },
                            {
                                path: "about",
                                component: About,
                                meta: { title: "About" },
                            },
                        ]
                    },
                ]
            },
        ]
    },
    {
        path: "/setup",
        component: Setup,
        meta: { title: "Setup" },
    },
];

export const router = createRouter({
    linkActiveClass: "active",
    history: createWebHistory(),
    routes,
});

router.beforeEach((to, from, next) => {
    if (to.meta.title) {
        document.title = to.meta.title + " - Dockge";
    }
    next();
});
