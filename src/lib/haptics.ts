import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

export const haptics = {
    impact: async (style: ImpactStyle = ImpactStyle.Light) => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.impact({ style });
        }
    },
    notification: async (type: NotificationType) => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.notification({ type });
        }
    },
    vibrate: async () => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.vibrate();
        }
    },
    selectionStart: async () => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.selectionStart();
        }
    },
    selectionChanged: async () => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.selectionChanged();
        }
    },
    selectionEnd: async () => {
        if (Capacitor.isNativePlatform()) {
            await Haptics.selectionEnd();
        }
    },
};
