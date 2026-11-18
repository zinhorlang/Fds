/*
 * zy for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Based on the Multi Account plugin of Unbound (n35da).
 */

import { tx } from "@core/i18n";
import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";

import { definePlugin } from "../api";
import { getStore } from "../common";
import { showText } from "../ui/dialogs";

const STORES = ["MultiAccount", "MultiAccountStore"];
const METHOD = "getCanUseMultiAccountMobile";
// getCanUseMultiAccountMobile, canUseMultiAccount, isMultiAccountEnabled...
const FLAG = /^(get)?(can|is)\w*multi.?account\w*$/i;

/** Discord registers its stores a little after the plugins start (Unbound's version starts after the first frame), so wait for it */
function waitForStore(tries = 80): Promise<any> {
    return new Promise(resolve => {
        const look = (left: number) => {
            let store = STORES.map(name => getStore(name)).find(s => s != null);
            // Not under that name in this Discord: the module that has the method is the store all the same
            if (!store) {
                try {
                    store = findByProps(METHOD);
                } catch { /* not there yet */ }
            }
            if (store || left <= 0) resolve(store);
            else setTimeout(() => look(left - 1), 250);
        };
        look(tries);
    });
}

/** Every method of the store, its own and inherited */
function methodNames(store: any): string[] {
    const names = new Set<string>();
    for (let o = store; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
        for (const key of Object.getOwnPropertyNames(o)) {
            try {
                if (key !== "constructor" && typeof store[key] === "function") names.add(key);
            } catch { /* a getter that throws */ }
        }
    }
    return [...names].sort();
}

export default definePlugin({
    id: "zy.multi-account",
    name: "MultiAccount",
    description: tx("Unlocks Discord's built-in account switcher on mobile, for up to 5 accounts"),
    icon: "UserCircleIcon",
    tags: ["Utility"],
    async start({ cleanup }) {
        const store = await waitForStore();
        if (!store) {
            showText("MultiAccount", "Discord's MultiAccount store wasn't found in this Discord version.");
            throw new Error("the account store wasn't found");
        }
        const methods = methodNames(store);
        const flags = methods.includes(METHOD) ? [METHOD] : methods.filter(name => FLAG.test(name));
        if (!flags.length) {
            showText("MultiAccount", `No switcher flag on Discord's account store. Send this text to the developer:\n\n${methods.join(", ") || "(no methods)"}`);
            throw new Error("no switcher flag on the account store");
        }
        // Cleanups run last to first: the patches come off, then everything that reads the store asks again
        cleanup(() => store.emitChange?.());
        for (const name of flags) cleanup(instead(name, store, () => true));
        store.emitChange?.();
    },
});
