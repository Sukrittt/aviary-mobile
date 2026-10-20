import { CurrencySetting } from '@/src/components/CurrencyPicker'
import { memo, useState, type ReactNode } from 'react'
import { View, Text, Image, Pressable, RefreshControl, Linking, Platform, Share, StyleSheet } from 'react-native'
import { Toggle } from '@/src/components/ui/Toggle'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { requestPinWidget } from 'react-native-android-widget'
import * as ImagePicker from 'expo-image-picker'
import * as Haptics from 'expo-haptics'
import { Gift, Brain, Wallet, Bank, TrendUp, Lock, Database, Archive, Repeat, CreditCard, ChatCircle, SquaresFour, CaretRight, Scan, Camera, Images, FileText, Receipt, ChartLine, ClockCounterClockwise, Plus, UserPlus, UploadSimple, type PhosphorIcon } from '@/src/components/shared/icons'
import { Screen } from '@/src/components/ui/Screen'
import { Alert } from '@/src/components/ui/AlertHost'
import { useTheme } from '@/src/theme/ThemeProvider'
import { fontFamily } from '@/src/theme/fonts'
import { Icon } from '@/src/components/shared/Icon'
import { LoadingPhrase } from '@/src/components/shared/LoadingPhrase'
import { BottomSheet } from '@/src/components/shared/Modal'
import { clearAccess, sessionId } from '@/src/api/accessMode'
import { revokeSession } from '@/src/api/account'
import { usePrivacy } from '@/src/context/PrivacyContext'
import { useInstantSetting } from '@/src/hooks/useInstantSetting'
import { monthAbbrev, monthLabel, shiftMonthKey } from '@/src/lib/envelope'
import { setPendingScanImage } from '@/src/lib/pendingScanImage'
import { BILL_ENCODING, downscaleImage } from '@/src/lib/downscaleImage'
import { WEB_URL } from '@/src/api/client'
import { getSystemStatus } from '@/src/api/systemStatus'
import { useUser } from '@/src/hooks/useUser'
import { useBillingStatus } from '@/src/hooks/useBillingStatus'
import { billingVisible, planSummary } from '@/src/lib/billingStatus'
import { useWrappedStatus } from '@/src/hooks/useWrapped'
import { useCategories } from '@/src/hooks/useCategories'
import { useRefresh } from '@/src/hooks/useRefresh'
import { useOnline } from '@/src/lib/netStatus'
import { count as pendingCount } from '@/src/lib/pendingExpenses'
import type { UserProfile } from '@/src/api/account'
import type { WrappedStatus } from '@/src/api/wrapped'
import appJson from '@/app.json'
import { isVersionNewer } from '@/src/lib/version'
import { hiddenFeatures, isHidden, OPT_IN_FEATURES } from '@/src/lib/features'
import { tap } from '@/src/lib/haptics'
import { BudgetSwitcherSheet } from '@/src/components/budgets/BudgetSwitcherSheet'
import { useBudgetSpaces } from '@/src/hooks/useBudgetSpaces'
import { track } from '@/src/lib/analytics'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
] as const

const NOTIFY_OPTIONS: { value: NonNullable<UserProfile['notifyCadence']>; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'daily', label: 'Daily' },
]

function MoreScreen() {
  const theme = useTheme()
  const { tokens } = theme
  const privacy = usePrivacy()
  const [preference, setPreference] = useInstantSetting(theme.preference, theme.setPreference)
  const [hideAmounts, setHideAmounts] = useInstantSetting(privacy.hideAmounts, privacy.setHideAmounts)
  const router = useRouter()
  const { refreshing, onRefresh } = useRefresh()

  const [signingOut, setSigningOut] = useState(false)
  const [scanPickerSheet, setScanPickerOpen] = useState(false)
  // The nav's quick-add menu lands here with ?scan=1: the scan route needs a photo picked first.
  const { scan } = useLocalSearchParams<{ scan?: string }>()
  const scanPickerOpen = scanPickerSheet || scan === '1'
  const closeScanPicker = () => {
    setScanPickerOpen(false)
    if (scan) router.setParams({ scan: undefined })
  }
  const online = useOnline()

  const userQuery = useUser()
  const user = userQuery.data
  const wrappedStatus = useWrappedStatus().data
  const billing = useBillingStatus().data
  // Until the billing status loads there's no plan to show, so the row opens
  // the trial notice.
  const showBilling = billingVisible(billing)
  const categoriesQ = useCategories()
  const systemStatusQ = useQuery({
    queryKey: ['system-status'],
    queryFn: getSystemStatus,
    staleTime: 5 * 60_000,
  })
  const scanOff = !!systemStatusQ.data?.aiDisabled
  const installedVersion = appJson.expo.version
  const androidUpdate = Platform.OS === 'android' ? systemStatusQ.data?.appUpdate?.android : undefined
  const updateAvailable = !!androidUpdate && isVersionNewer(androidUpdate.latestVersion, installedVersion)

  async function doSignOut() {
    // The revoke is a network round-trip (up to apiFetch's 15s timeout),
    // so the button has to say it's working — and refuse a second tap.
    setSigningOut(true)
    // Revoke server-side first, while the bearer token is still live —
    // clearAccess() below drops it. A failure here only means the WorkOS
    // session outlives this device; sign out locally either way.
    const sid = sessionId()
    let revoked = true
    if (sid) {
      try {
        await revokeSession(sid)
      } catch {
        revoked = false
      }
    }
    await clearAccess()
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    // No setSigningOut(false): clearAccess unmounts this screen via the
    // root navigator's session guard. Resetting it would only flash
    // "Sign out" back on a screen that is already leaving.
    if (!revoked) {
      Alert.alert('Signed out', "This device is signed out, but we couldn't reach the server to end the session there too.")
    }
  }

  // Scan is a server write (uploads to Gemini, then a manual-entry POST) —
  // it must stand down offline rather than fail partway through a picked photo.
  function openScanPicker() {
    if (!online) {
      Alert.alert("You're offline", "Scan a bill once you're back online, or log this expense manually.")
      return
    }
    void systemStatusQ.refetch()
    setScanPickerOpen(true)
  }

  async function pickBillFrom(source: 'camera' | 'library') {
    Haptics.selectionAsync().catch(() => {})
    const perm =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      closeScanPicker()
      Alert.alert('Permission needed', 'Camera/photo access is off. Enable it in Settings, or enter this expense manually.')
      return
    }

    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true }
    const result =
      source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options)
    if (result.canceled || !result.assets?.[0]) {
      closeScanPicker()
      return
    }

    const asset = result.assets[0]
    if (!asset.base64) {
      closeScanPicker()
      Alert.alert("Couldn't read that image", 'Try again or enter this expense manually.')
      return
    }
    // The scan route always requires a non-empty category list — guarded here,
    // before the handoff, rather than sending Gemini an empty enum constraint.
    // Wait out an in-flight fetch instead of trusting a still-undefined `.data`:
    // refetch() joins the request already underway rather than firing a second one.
    let categories = categoriesQ.data
    if (categoriesQ.isLoading) {
      categories = (await categoriesQ.refetch()).data
    }
    if ((categories ?? []).length === 0) {
      closeScanPicker()
      Alert.alert('No categories yet', 'Add one first, or enter this expense manually.')
      return
    }

    setPendingScanImage((await downscaleImage(asset, BILL_ENCODING)) ?? { base64: asset.base64, mimeType: asset.mimeType ?? 'image/jpeg' })
    closeScanPicker()
    router.push('/modals/scan-bill')
  }

  const displayName = user?.name || user?.email || 'You'
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'
  const wrappedCard = wrappedCardProps(wrappedStatus, tokens)
  const extrasOff = OPT_IN_FEATURES.filter((k) => isHidden(user, k)).length

  return (
    <>
      <Screen
        title="You"
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} colors={[tokens.accent]} />
        }
      >
          {/* Profile */}
          <Pressable
            onPress={() => router.push('/account/security')}
            style={[styles.profileCard, { backgroundColor: tokens.card, borderColor: tokens.borderStrong }]}
          >
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={[styles.avatar, { borderColor: tokens.accent }]} />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: tokens.accentSoft, borderColor: tokens.accent }]}>
                <Text style={[styles.avatarText, { color: tokens.accentInk, fontFamily: fontFamily.displaySemiBold }]}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.name, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]} numberOfLines={1}>
                {displayName}
              </Text>
              {user?.email && (
                <Text style={[styles.email, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]} numberOfLines={1}>
                  {user.email}
                </Text>
              )}
            </View>
            <CaretRight size={16} color={tokens.text3} />
          </Pressable>

          {/* Early access feedback */}
          <Pressable
            onPress={() => router.push('/account/ideas')}
            style={[styles.earlyCard, { backgroundColor: tokens.card, borderColor: tokens.border }]}
          >
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.badge, styles.earlyBadge, { backgroundColor: tokens.mintSoft }]}>
                <Text style={[styles.badgeText, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>Early access</Text>
              </View>
              <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>
                {"Aviary's still early. Help shape it."}
              </Text>
              <Text style={[styles.rowHint, { color: tokens.text2, fontFamily: fontFamily.bodyMedium }]}>
                Post ideas and vote on what we build next. We read every one.
              </Text>
            </View>
            <View style={[styles.featureIcon, { backgroundColor: tokens.mintSoft }]}>
              <Icon icon={ChatCircle} size={18} color={tokens.mint} />
            </View>
          </Pressable>

          {/* BUDGET */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>BUDGET</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                icon={UploadSimple}
                label="Add from statement"
                blurb="Catch up from a screenshot or file"
                iconBg={tokens.blueSoft}
                iconColor={tokens.blue}
                onPress={() => router.push('/modals/statement')}
              />
              {!isHidden(user, 'income') && <FeatureCard
                icon={Wallet}
                label="Income"
                blurb="What comes in and when"
                iconBg={tokens.mintSoft}
                iconColor={tokens.mint}
                onPress={() => router.push('/account/income')}
              />}
              {!isHidden(user, 'accounts') && <FeatureCard
                icon={Bank}
                label="Accounts"
                blurb="Bank, card and cash"
                iconBg={tokens.accentSoft}
                iconColor={tokens.accent}
                onPress={() => router.push('/account/accounts')}
              />}
              {!isHidden(user, 'recurring') && <FeatureCard
                icon={Repeat}
                label="Recurring expenses"
                blurb="Plan upcoming payments"
                iconBg={tokens.violetSoft}
                iconColor={tokens.violet}
                onPress={() => router.push('/account/recurring')}
              />}
              <FeatureCard
                icon={Archive}
                label="Archive"
                blurb="Restore deleted items"
                iconBg={tokens.blueSoft}
                iconColor={tokens.blue}
                onPress={() => router.push('/account/archive')}
              />
            </View>
          </View>

          {/* EXTRAS: only what's switched on, plus one way to switch on the rest. */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>EXTRAS</Text>
            {/* Waits for the profile: until it loads every extra reads as on, and a new account's would flash in and out. */}
            {user && extrasOff < OPT_IN_FEATURES.length && <View style={styles.featureGrid}>
              {!isHidden(user, 'wrapped') && <FeatureCard
                icon={wrappedCard.icon}
                label="Expense Wrapped"
                blurb={wrappedCard.blurb}
                iconBg={wrappedCard.iconBg}
                iconColor={wrappedCard.iconColor}
                onPress={wrappedCard.available ? () => router.push('/wrapped') : undefined}
                disabled={!wrappedCard.available}
              />}
              {!isHidden(user, 'askAviary') && <FeatureCard
                icon={Brain}
                label="Ask Aviary"
                blurb="Ask about your spending"
                iconBg={tokens.accentSoft}
                iconColor={tokens.accent}
                onPress={() => router.push('/modals/money-brain')}
              />}
              {!isHidden(user, 'investments') && <FeatureCard
                icon={TrendUp}
                label="Investments"
                blurb="Portfolio at a glance"
                iconBg={tokens.mintSoft}
                iconColor={tokens.mint}
                onPress={() => router.push('/investments')}
              />}
              {!isHidden(user, 'billScan') && <FeatureCard
                icon={Scan}
                label="Scan a bill"
                blurb="Split a cart or receipt"
                iconBg={tokens.mintSoft}
                iconColor={tokens.mint}
                onPress={openScanPicker}
              />}
              {!isHidden(user, 'subscriptions') && <FeatureCard
                icon={Receipt}
                label="Subscriptions"
                blurb="What renews and when"
                iconBg={tokens.violetSoft}
                iconColor={tokens.violet}
                onPress={() => router.push('/subscriptions')}
              />}
              {!isHidden(user, 'insights') && <FeatureCard
                icon={ChartLine}
                label="Insights"
                blurb="Trends and breakdowns"
                iconBg={tokens.blueSoft}
                iconColor={tokens.blue}
                onPress={() => router.push('/insights')}
              />}
            </View>}
            {user && extrasOff > 0 && (
              <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
                <AccountRow
                  icon={Plus}
                  label="Turn on more"
                  hint={extrasOff === 1 ? '1 more you can switch on' : `${extrasOff} more you can switch on`}
                  onPress={() => router.push('/account/features')}
                  tokens={tokens}
                />
              </View>
            )}
          </View>

          {/* PREFERENCES */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>PREFERENCES</Text>
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <CurrencySetting />
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Appearance</Text>
                <View style={[styles.segmented, { backgroundColor: tokens.inputBg }]}>
                  {THEME_OPTIONS.map((opt) => {
                    const active = preference === opt.value
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          if (!active) Haptics.selectionAsync().catch(() => {})
                          setPreference(opt.value)
                        }}
                        style={[styles.segment, { backgroundColor: active ? tokens.accent : 'transparent' }]}
                      >
                        <Text style={[styles.segmentText, { color: active ? tokens.onAccent : tokens.text2, fontFamily: fontFamily.bodySemiBold }]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Hide amounts</Text>
                  <Text style={[styles.rowHint, { color: tokens.text2 }]}>Blur balances when the app opens</Text>
                </View>
                <Toggle
                  value={hideAmounts}
                  onValueChange={setHideAmounts}
                />
              </View>
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <Pressable onPress={() => router.push('/account/notifications')} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Notifications</Text>
                  <Text style={[styles.rowHint, { color: tokens.text2 }]}>
                    {NOTIFY_OPTIONS.find((o) => o.value === (user?.notifyCadence ?? 'off'))?.label}
                  </Text>
                </View>
                <CaretRight size={16} color={tokens.text3} />
              </Pressable>
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <Pressable onPress={() => router.push('/account/features')} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>Features</Text>
                  <Text style={[styles.rowHint, { color: tokens.text2 }]}>
                    {hiddenFeatures(user).length ? `${hiddenFeatures(user).length} hidden` : 'Hide what you don\'t use'}
                  </Text>
                </View>
                <CaretRight size={16} color={tokens.text3} />
              </Pressable>
            </View>
          </View>

          {/* ACCOUNT */}
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: tokens.text3, fontFamily: fontFamily.bodyBold }]}>ACCOUNT</Text>
            <View style={[styles.card, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
              <AccountRow icon={Lock} label="Account & security" onPress={() => router.push('/account/security')} tokens={tokens} />
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <AccountRow icon={Database} label="Your data" onPress={() => router.push('/account/data')} tokens={tokens} />
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <BudgetsRow tokens={tokens} />
              {Platform.OS === 'android' && (
                <>
                  <View style={[styles.divider, { backgroundColor: tokens.border }]} />
                  <AccountRow
                    icon={SquaresFour}
                    label="Add widget to home screen"
                    onPress={() => void requestPinWidget({ widgetName: 'Envelope' })}
                    tokens={tokens}
                  />
                </>
              )}
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <Pressable onPress={() => router.push(showBilling ? '/account/plan' : '/account/trial-notice?from=more')} style={styles.row}>
                <Icon icon={CreditCard} size={16} color={tokens.text} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>
                    Plan & billing
                  </Text>
                  <Text style={[styles.rowHint, { color: tokens.text2 }]}>{showBilling && billing ? planSummary(billing) : "You're on the trial plan"}</Text>
                </View>
                <Pressable
                  onPress={() => Linking.openURL('https://github.com/Sukrittt/aviary-mobile')}
                  style={[styles.badge, { backgroundColor: tokens.mintSoft }]}
                >
                  <Text style={[styles.badgeText, { color: tokens.mint, fontFamily: fontFamily.bodyBold }]}>Open source</Text>
                </Pressable>
              </Pressable>
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <AccountRow icon={UserPlus} label="Invite a friend" hint="Share Aviary with someone" onPress={inviteFriend} tokens={tokens} />
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <AccountRow icon={ChatCircle} label="Help & feedback" hint="Tour, changelog and more" onPress={() => router.push('/account/help')} tokens={tokens} />
              <View style={[styles.divider, { backgroundColor: tokens.border }]} />
              <AccountRow
                icon={FileText}
                label="Terms & privacy"
                onPress={() => Linking.openURL(`${WEB_URL}/legal/privacy`)}
                tokens={tokens}
              />
            </View>
          </View>

          <Pressable
            onPress={async () => {
              tap()
              // A queued offline expense lives only in this device's AsyncStorage,
              // namespaced by user id — signing out doesn't delete it (so signing
              // back in as the same person recovers it), but signing out and back
              // in as someone *else* would leave it stranded with nobody flushing
              // it. Confirm rather than silently letting that happen.
              const waiting = await pendingCount()
              if (waiting > 0) {
                Alert.alert(
                  waiting === 1 ? "1 expense hasn't synced yet" : `${waiting} expenses haven't synced yet`,
                  "Signing out now is fine if you're signing back in as you. Otherwise, reconnect first so they can sync.",
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Sign out anyway', style: 'destructive', onPress: doSignOut },
                  ],
                )
                return
              }
              await doSignOut()
            }}
            disabled={signingOut}
            style={[styles.card, styles.logoutButton, { backgroundColor: 'transparent', borderColor: tokens.coral, opacity: signingOut ? 0.6 : 1 }]}
          >
            <Text style={[styles.logoutText, { color: tokens.coral, fontFamily: fontFamily.bodySemiBold }]}>
              {signingOut ? 'Signing out…' : 'Sign out'}
            </Text>
          </Pressable>

          <View style={styles.versionBlock}>
            <Text style={[styles.version, { color: tokens.text3, fontFamily: fontFamily.bodyMedium }]}>
              v{installedVersion} · built in the open
            </Text>
            {updateAvailable && androidUpdate && (
              <Pressable accessibilityRole="link" onPress={() => Linking.openURL(androidUpdate.storeUrl)} hitSlop={8}>
                <Text style={[styles.updateLink, { color: tokens.accent, fontFamily: fontFamily.bodyBold }]}>
                  Update available · v{androidUpdate.latestVersion} →
                </Text>
              </Pressable>
            )}
          </View>
      </Screen>

      <BottomSheet visible={scanPickerOpen} onClose={closeScanPicker}>
        <Text style={[styles.sheetTitle, { color: tokens.text, fontFamily: fontFamily.displaySemiBold }]}>Scan a bill</Text>
        <View style={styles.sourceTiles}>
          <SourceTile
            icon={Camera}
            label="Take a photo"
            hint="Point at a receipt"
            primary
            disabled={scanOff}
            onPress={() => pickBillFrom('camera')}
          />
          <SourceTile
            icon={Images}
            label="Choose a screenshot"
            hint="From your gallery"
            disabled={scanOff}
            onPress={() => pickBillFrom('library')}
          />
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            closeScanPicker()
            router.push('/account/bill-scans')
          }}
          style={styles.historyRow}
        >
          <ClockCounterClockwise size={18} color={tokens.text2} />
          <Text style={[styles.sourceLabel, { color: tokens.text2, fontFamily: fontFamily.bodySemiBold, flex: 1 }]}>Previous scans</Text>
          <CaretRight size={16} color={tokens.text2} />
        </Pressable>
      </BottomSheet>
    </>
  )
}

/** One of the scan sheet's two capture tiles. `primary` is the filled accent one, for the source most bills come from. */
function SourceTile({
  icon: Icon,
  label,
  hint,
  primary = false,
  disabled,
  onPress,
}: {
  icon: PhosphorIcon
  label: string
  hint: string
  primary?: boolean
  disabled: boolean
  onPress: () => void
}) {
  const { tokens } = useTheme()
  const ink = primary ? tokens.onAccent : tokens.text
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.sourceTile,
        {
          backgroundColor: primary ? tokens.accent : tokens.inputBg,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.sourceIcon, { backgroundColor: primary ? 'rgba(255,255,255,0.2)' : tokens.accentSoft }]}>
        <Icon size={22} color={primary ? tokens.onAccent : tokens.accentInk} />
      </View>
      <Text style={[styles.sourceLabel, { color: ink, fontFamily: fontFamily.bodyBold }]}>{label}</Text>
      {disabled ? (
        <MaintenanceChip />
      ) : (
        <Text style={[styles.sourceHint, { color: ink, fontFamily: fontFamily.bodySemiBold }]}>{hint}</Text>
      )}
    </Pressable>
  )
}

function MaintenanceChip() {
  const { tokens } = useTheme()
  return (
    <View style={[styles.chip, { backgroundColor: tokens.warnSoft }]}>
      <Text style={{ color: tokens.warn, fontFamily: fontFamily.bodyBold, fontSize: 12 }}>Under maintenance</Text>
    </View>
  )
}

function FeatureCard({
  icon,
  label,
  blurb,
  iconBg,
  iconColor,
  onPress,
  disabled,
}: {
  icon: PhosphorIcon
  label: string
  blurb: ReactNode
  iconBg: string
  iconColor: string
  onPress?: () => void
  disabled?: boolean
}) {
  const { tokens } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.featureCard, { backgroundColor: tokens.card, borderColor: tokens.border }, disabled && styles.featureCardDisabled]}
    >
      <View style={[styles.featureIcon, { backgroundColor: iconBg }]}>
        <Icon icon={icon} size={18} color={iconColor} />
      </View>
      <Text style={[styles.featureLabel, { color: tokens.text, fontFamily: fontFamily.bodyExtraBold }]}>{label}</Text>
      {typeof blurb === 'string' ? <Text style={[styles.featureBlurb, { color: tokens.text2 }]}>{blurb}</Text> : blurb}
    </Pressable>
  )
}

/** 10-dot progress tracker toward next month's Wrapped unlock, filled-capped at `goal`. */
function dotTracker(count: number, goal: number): string {
  const filled = Math.min(count, goal)
  return '●'.repeat(filled) + '○'.repeat(goal - filled)
}

const WRAPPED_LOADING_PHRASES = ['Checking last month…', 'Counting transactions…', 'Tallying it up…', 'Almost there…']

function wrappedCardProps(status: WrappedStatus | undefined, tokens: ReturnType<typeof useTheme>['tokens']) {
  if (!status) {
    return {
      icon: Gift,
      iconBg: tokens.coralSoft,
      iconColor: tokens.coral,
      blurb: <LoadingPhrase phrases={WRAPPED_LOADING_PHRASES} color={tokens.text2} style={styles.featureBlurb} />,
      available: false,
    }
  }
  if (status.available) {
    return {
      icon: Gift,
      iconBg: tokens.coralSoft,
      iconColor: tokens.coral,
      blurb: `Your ${monthLabel(status.month)}, wrapped`,
      available: true,
    }
  }

  const { currentMonth, currentMonthCount, minTransactions } = status
  const goalReached = currentMonthCount >= minTransactions
  const nextMonthAbbrev = monthAbbrev(shiftMonthKey(currentMonth, 1))
  const dots = dotTracker(currentMonthCount, minTransactions)
  const label = goalReached
    ? `Wrap unlocks ${nextMonthAbbrev} 1`
    : `${currentMonthCount}/${minTransactions} · unlocks ${nextMonthAbbrev} 1`
  const a11yLabel = goalReached
    ? `${minTransactions} of ${minTransactions} transactions logged. Wrap unlocks ${nextMonthAbbrev} 1.`
    : `${currentMonthCount} of ${minTransactions} transactions logged. Unlocks ${nextMonthAbbrev} 1.`
  const dotsColor = goalReached ? tokens.mint : tokens.text3

  return {
    icon: Gift,
    iconBg: tokens.coralSoft,
    iconColor: tokens.coral,
    available: false,
    blurb: (
      <View accessible accessibilityLabel={a11yLabel}>
        <Text style={[styles.dots, { color: dotsColor }]}>{dots}</Text>
        <Text style={[styles.featureBlurb, { color: tokens.text2 }]}>{label}</Text>
      </View>
    ),
  }
}

const INVITE_URL = `${WEB_URL}/?ref=invite`

// Android reports sharedAction even when the chooser is dismissed, so this
// counts share sheets opened, not invites actually sent.
function inviteFriend() {
  track('invite_shared')
  Share.share({ message: `I've been budgeting with Aviary. Give it a try: ${INVITE_URL}` }).catch(() => {})
}

/** More → Budgets: where a one-budget person makes their second, and where everyone can switch. */
function BudgetsRow({ tokens }: { tokens: ReturnType<typeof useTheme>['tokens'] }) {
  const { multi, active, count } = useBudgetSpaces()
  const [open, setOpen] = useState(false)
  return (
    <>
      <AccountRow
        icon={Wallet}
        label="Budgets"
        hint={multi && active ? `${count} budgets · you're in ${active.name}` : 'Start one for a trip or a shared home'}
        onPress={() => setOpen(true)}
        tokens={tokens}
      />
      <BudgetSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  )
}

function AccountRow({
  icon,
  label,
  hint,
  onPress,
  tokens,
}: {
  icon: PhosphorIcon
  label: string
  hint?: string
  onPress: () => void
  tokens: ReturnType<typeof useTheme>['tokens']
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Icon icon={icon} size={16} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.rowLabel, { color: tokens.text, fontFamily: fontFamily.bodySemiBold }]}>{label}</Text>
        {hint && <Text style={[styles.rowHint, { color: tokens.text2 }]}>{hint}</Text>}
      </View>
      <CaretRight size={16} color={tokens.text3} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: { gap: 22, paddingTop: 4 },
  profileCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderRadius: 22 },
  avatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 20 },
  name: { fontSize: 16 },
  email: { fontSize: 12, marginTop: 1 },
  section: { gap: 10 },
  sectionHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  sectionLabel: { fontSize: 12, letterSpacing: 0.5, paddingHorizontal: 4 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  featureCard: { width: '47.5%', gap: 8, padding: 16, borderWidth: 1, borderRadius: 20 },
  featureCardDisabled: { opacity: 0.5 },
  featureIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  featureLabel: { fontSize: 14 },
  featureBlurb: { fontSize: 12, lineHeight: 15 },
  dots: { fontSize: 12, letterSpacing: 2, marginBottom: 3 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, gap: 12 },
  rowLabel: { fontSize: 14 },
  rowHint: { fontSize: 12, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth },
  segmented: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 100 },
  segment: { borderRadius: 100, paddingHorizontal: 12, paddingVertical: 8 },
  segmentText: { fontSize: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100 },
  badgeText: { fontSize: 12 },
  earlyCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderWidth: 1, borderRadius: 22 },
  earlyBadge: { alignSelf: 'flex-start', paddingVertical: 3 },
  logoutButton: { alignItems: 'center', paddingVertical: 16 },
  logoutText: { fontSize: 14 },
  version: { fontSize: 12, textAlign: 'center' },
  versionBlock: { alignItems: 'center', gap: 7 },
  updateLink: { fontSize: 12, textAlign: 'center' },
  sheetTitle: { fontSize: 17, marginBottom: 12 },
  sourceTiles: { flexDirection: 'row', gap: 10 },
  sourceTile: { flex: 1, borderRadius: 20, padding: 16, gap: 6, minHeight: 140 },
  sourceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 'auto' },
  sourceHint: { fontSize: 13, opacity: 0.75 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 4, marginTop: 6 },
  sourceLabel: { fontSize: 15 },
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
})

// memo: expo-router re-renders a tab's screen on every focus change with a
// fresh props object, and a full MoreScreen render held up each tab switch.
export default memo(MoreScreen)
