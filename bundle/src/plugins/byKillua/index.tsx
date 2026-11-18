/*
 * zy for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * by Killua: one tap generates a whole profile on CustomProfile (Nitro and Boost badges, badges, banner colors, avatar
 * decoration and profile effect). Like everything CustomProfile does, only you see it.
 */

import { tx } from "@core/i18n";
import { enablePlugin, isPluginEnabled } from "@lib/addons/plugins";
import { showToast } from "@lib/ui/toasts";
import { findByProps } from "@metro";
import { Button, Stack } from "@metro/common/components";

import { definePlugin } from "../api";
import { getStore } from "../common";
import {
    AVATAR_DECORATIONS, COLLECTIBLE_PROFILE_EFFECT, type CustomProfileData, FLAG, GIFT_IDS, hasAnyCustomData,
    NITRO_LEVELS, TIERED_BADGES
} from "../customProfile/data";
import { accountData, myId, resetAccount, saveAccount } from "../customProfile/store";

const CUSTOM_PROFILE = "zy.custom-profile";
const BOOST_LEVELS = 9;
// Colors like Discord's own palette, for the profile theme
const COLORS = [0x5865f2, 0xeb459e, 0xed4245, 0xfee75c, 0x57f287, 0x9b59b6, 0x1abc9c, 0xe67e22, 0x00b0f4, 0xff73fa];
// The fields this plugin writes, which "Remove" takes back
const GENERATED: Array<keyof CustomProfileData> = [
    "nitro", "nitroLevel", "boostMonths", "badgeFlags", "customBadgeIds", "tieredBadges", "decorationAsset", "profileEffectId",
    "accentColor", "accentColor2"
];

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];
const between = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

/** The profile effects of Discord's shop, which has to be loaded first when the shop hasn't been opened yet */
function shopEffectIds(): Promise<string[]> {
    return new Promise(resolve => {
        const store = getStore("CollectiblesCategoryStore");
        if (!store) return resolve([]);
        if (!store.lastSuccessfulFetch && !store.isFetchingCategories) {
            const fetchCategories = findByProps("fetchCollectiblesCategories")?.fetchCollectiblesCategories;
            if (typeof fetchCategories === "function") Promise.resolve().then(() => fetchCategories({})).catch(() => { });
        }
        const read = () => {
            const { products } = store;
            const all: any[] = products instanceof Map ? [...products.values()] : Object.values(products ?? {});
            const ids = new Set<string>();
            for (const product of all) {
                const item = product?.items?.length === 1 ? product.items[0] : null;
                if (item?.type === COLLECTIBLE_PROFILE_EFFECT && product.skuId) ids.add(product.skuId);
            }
            return [...ids];
        };
        const look = (left: number) => {
            const ids = read();
            if (ids.length || left <= 0) resolve(ids);
            else setTimeout(() => look(left - 1), 300);
        };
        look(20);
    });
}

async function generate(banner: string) {
    const id = myId();
    if (!id) return showToast("Não achei a sua conta");
    // CustomProfile is what draws the profile: turn it on when it's off
    if (!isPluginEnabled(CUSTOM_PROFILE)) {
        try {
            await enablePlugin(CUSTOM_PROFILE, true);
        } catch {
            return showToast("Ligue o plugin CustomProfile para ver o perfil");
        }
    }

    const house = pick([FLAG.BRAVERY, FLAG.BRILLIANCE, FLAG.BALANCE]);
    const tieredBadges: Record<string, number> = {};
    for (const type of TIERED_BADGES) tieredBadges[type.key] = between(Math.floor(type.tiers.length / 2), type.tiers.length - 1);
    const first = pick(COLORS);
    const effects = await shopEffectIds();

    const data: CustomProfileData = {
        ...accountData(id),
        nitro: true,
        nitroLevel: between(4, NITRO_LEVELS.length - 1),
        boostMonths: between(4, BOOST_LEVELS - 1),
        // Not the staff or partner badges: nobody should read those as Discord's own word
        badgeFlags: house | FLAG.HYPESQUAD | FLAG.EARLY_SUPPORTER | FLAG.BUG_HUNTER_2 | FLAG.ACTIVE_DEVELOPER | FLAG.DEV_VERIFIED,
        customBadgeIds: ["quest", "orbs", "meadow", pick(GIFT_IDS)],
        tieredBadges,
        decorationAsset: pick(AVATAR_DECORATIONS).id,
        profileEffectId: effects.length ? pick(effects) : undefined,
        accentColor: first,
        accentColor2: pick(COLORS.filter(c => c !== first)),
    };
    if (banner.trim()) data.banner = banner.trim();
    saveAccount(id, data);
    showToast(effects.length ? "Perfil gerado! Abra o seu perfil para ver" : "Perfil gerado! (sem efeito: a loja não carregou)");
}

function remove() {
    const id = myId();
    if (!id) return;
    const data = accountData(id);
    for (const key of GENERATED) delete data[key];
    if (hasAnyCustomData(data)) saveAccount(id, data);
    else resetAccount(id);
    showToast("Perfil gerado removido");
}

export default definePlugin({
    id: "zy.by-killua",
    name: "by Killua",
    description: tx("Generates a whole profile with one tap: Nitro and Boost badges, banner colors, avatar frame and profile effect, only you see it"),
    icon: "UserCircleIcon",
    tags: ["Customisation"],
    settings: {
        banner: {
            type: "string",
            label: tx("Banner"),
            default: "",
            placeholder: "https://",
        },
    },
    start() { },
    SettingsComponent: ({ store }) => <Stack spacing={8}>
        <Button text="Gerar perfil" variant="primary" onPress={() => void generate(store.banner)} />
        <Button text="Remover perfil gerado" variant="secondary" onPress={remove} />
    </Stack>,
});
