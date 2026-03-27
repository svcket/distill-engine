"use client"

import { useEffect } from "react"
import OneSignal from "react-onesignal"
import { useSession } from "next-auth/react"

export function OneSignalProvider({ children }: { children: React.ReactNode }) {
    const { data: session } = useSession()

    const syncTokenWithDB = async (oneSignalUserId: string) => {
        try {
            await fetch("/api/user/preferences", {
                method: "PATCH",
                body: JSON.stringify({ oneSignalUserId }),
                headers: { "Content-Type": "application/json" }
            })
            console.log("OneSignal ID synced with Distill Database.")
        } catch (error) {
            console.error("Failed to sync OneSignal ID:", error)
        }
    }

    useEffect(() => {
        const initOneSignal = async () => {
            const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID
            if (!appId) {
                console.warn("OneSignal App ID not found in environment variables.")
                return
            }

            try {
                await OneSignal.init({
                    appId,
                    allowLocalhostAsSecureOrigin: true,
                    notifyButton: {
                        enable: true,
                        displayPredicate: () => true,
                        prenotify: true,
                        showCredit: false,
                        text: {
                            'tip.state.unsubscribed': 'Subscribe to notifications',
                            'tip.state.subscribed': "You're subscribed to notifications",
                            'tip.state.blocked': "You've blocked notifications",
                            'message.prenotify': 'Click to subscribe to notifications',
                            'message.action.subscribed': "Thanks for subscribing!",
                            'message.action.resubscribed': "You're subscribed to notifications",
                            'message.action.unsubscribed': "You won't receive notifications again",
                            'message.action.subscribing': "Subscribing...",
                            'dialog.main.title': 'Manage Site Notifications',
                            'dialog.main.button.subscribe': 'SUBSCRIBE',
                            'dialog.main.button.unsubscribe': 'UNSUBSCRIBE',
                            'dialog.blocked.title': 'Unblock Notifications',
                            'dialog.blocked.message': 'Follow these instructions to allow notifications:'
                        }
                    },
                })

                if (session?.user?.id) {
                    await OneSignal.login(session.user.id)
                    const state = OneSignal.User.PushSubscription.id;
                    if (state) {
                        await syncTokenWithDB(state)
                    }
                }
            } catch (error) {
                console.error("OneSignal Initialization Error:", error)
            }
        }

        initOneSignal()
    }, [session?.user?.id])

    return <>{children}</>
}
