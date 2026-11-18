/*
 * zy for Android
 * Copyright (c) 2026 rootpoi and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * Draws an image behind every Discord screen and makes the usual background colors see-through so it shows.
 */

import { t, tx } from "@core/i18n";
import { addBackground } from "@core/overlay";
import { getNativeModule } from "@lib/api/native/modules";
import { instead } from "@lib/api/patcher";
import { findByProps } from "@metro";
import { Button } from "@metro/common/components";
import { semanticColors } from "@ui/color";
import { Image, StyleSheet } from "react-native";

import { definePlugin } from "../api";
import { toastError } from "../hooks";

/** Every option the native picker reads; it crashes on any missing one (see customProfile's Editor.tsx) */
const PICKER_DEFAULTS = {
    mediaType: "photo", videoQuality: "high", quality: 0.85, maxWidth: 1440, maxHeight: 2560, includeBase64: true,
    cameraType: "back", selectionLimit: 1, saveToPhotos: false, durationLimit: 0, includeExtra: false, presentationStyle: "pageSheet",
};

/** Asks the photo picker for an image, as a data: link so it doesn't depend on the file staying where it is */
function pickImage(): Promise<string | undefined> {
    const picker = getNativeModule("ImagePickerManager");
    if (typeof picker?.launchImageLibrary !== "function") return Promise.reject(new Error("Couldn't open the photo picker"));
    return new Promise((resolve, reject) => picker.launchImageLibrary(
        PICKER_DEFAULTS,
        (res: any) => {
            if (res?.didCancel) return resolve(undefined);
            const asset = res?.assets?.[0];
            if (res?.errorCode || !asset?.base64) return reject(new Error(res?.errorMessage || "Couldn't open the photo picker"));
            resolve(`data:${asset.type || "image/jpeg"};base64,${asset.base64}`);
        },
    ));
}

// The semantic colors used for full-screen and panel backgrounds, across every name Discord has given them as it
// renamed its design tokens over time (old and current at once, since different screens can still use either)
const BACKGROUND_NAMES = [
    "BACKGROUND_PRIMARY", "BACKGROUND_SECONDARY", "BACKGROUND_SECONDARY_ALT", "BACKGROUND_TERTIARY",
    "BACKGROUND_MOBILE_PRIMARY", "BACKGROUND_MOBILE_SECONDARY", "BACKGROUND_FLOATING", "BACKGROUND_NESTED_FLOATING",
    "BACKGROUND_BASE_LOW", "BACKGROUND_BASE_LOWER", "BACKGROUND_BASE_LOWEST",
    "BACKGROUND_SURFACE_HIGH", "BACKGROUND_SURFACE_HIGHEST",
    "BG_BASE_PRIMARY", "BG_BASE_SECONDARY", "BG_BASE_TERTIARY",
    "BG_SURFACE_RAISED", "BG_SURFACE_OVERLAY", "BG_SURFACE_OVERLAY_TMP", "BG_BACKDROP",
    "CHAT_BACKGROUND", "CHAT_INPUT_BACKGROUND",
];

/**
 * Returns a hex color with the given alpha, in #RRGGBBAA, never rgba(...): some of Discord's own color helpers
 * (such as DM sticker greetings' hexWithOpacity) take only hex and crash on anything else.
 */
function withAlpha(color: string, alpha: number): string {
    if (typeof color !== "string") return color;
    let r: number, g: number, b: number;
    if (color.startsWith("#")) {
        let hex = color.slice(1, 7);
        if (hex.length === 3) hex = [...hex].map(c => c + c).join("");
        if (hex.length !== 6) return color;
        [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    } else {
        const m = color.match(/rgba?\(([^)]+)\)/);
        if (!m) return color;
        [r, g, b] = m[1].split(",").slice(0, 3).map(s => parseFloat(s));
    }
    if ([r, g, b].some(Number.isNaN)) return color;
    const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
    const hex2 = (n: number) => n.toString(16).padStart(2, "0");
    return `#${hex2(r)}${hex2(g)}${hex2(b)}${hex2(a)}`;
}

function Backdrop() {
    const uri = Wallpaper.store.url.trim();
    if (!uri) return null;
    return <Image source={{ uri }} resizeMode="cover" style={StyleSheet.absoluteFill} blurRadius={Wallpaper.store.blur || undefined} />;
}

const Wallpaper = definePlugin({
    id: "zy.wallpaper",
    name: "Wallpaper",
    description: tx("Puts any image you choose behind Discord as the app's background"),
    icon: "ImageIcon",
    tags: ["Appearance"],
    settings: {
        url: { type: "string", label: tx("Image link"), default: "", placeholder: "https://" },
        opacity: { type: "number", label: tx("Background visibility"), description: tx("How see-through Discord's own backgrounds are, so the image shows"), default: 70, min: 0, max: 100 },
        blur: { type: "number", label: tx("Blur"), default: 0, min: 0, max: 20 },
    },
    SettingsComponent: ({ store }) => <Button
        text={t("Pick from this phone")}
        variant="secondary"
        onPress={() => void pickImage().then(uri => uri && (store.url = uri)).catch(toastError)}
    />,
    start({ cleanup }) {
        cleanup(addBackground("wallpaper", Backdrop));

        const targets = new Set(BACKGROUND_NAMES.map(name => semanticColors?.[name]).filter(Boolean));
        const colorModule = findByProps("SemanticColor")?.default;
        const resolver = colorModule?.meta ?? colorModule?.internal;
        if (resolver && typeof resolver.resolveSemanticColor === "function") {
            cleanup(instead("resolveSemanticColor", resolver, (args: unknown[], original: Function) => {
                const [theme, sym] = args;
                const resolved = original(theme, sym) as string;
                if (!Wallpaper.store.url.trim() || !targets.has(sym)) return resolved;
                return withAlpha(resolved, 1 - Wallpaper.store.opacity / 100);
            }));
        } else {
            console.error("[zy] Wallpaper: resolveSemanticColor wasn't found, backgrounds stay opaque");
        }
    },
});

export default Wallpaper;
