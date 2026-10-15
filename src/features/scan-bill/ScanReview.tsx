import { useCurrency } from '@/src/context/CurrencyContext'
import { CategoryPickerSheet } from "@/src/components/shared/CategoryPickerSheet";
import { PopIn } from "@/src/components/shared/PopIn";
import { AmountText } from "@/src/components/ui/AmountText";
import { Card } from "@/src/components/ui/Card";
import { Chip } from "@/src/components/ui/Chip";
import { splitEmoji } from "@/src/lib/emoji";
import { CategoryIcon } from "@/src/components/shared/CategoryIcon";

import {
  round2,
} from "@/src/lib/split";
import { fontFamily } from "@/src/theme/fonts";
import { Check, Plus, MagnifyingGlass, Trash } from "@/src/components/shared/icons";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { tap } from "@/src/lib/haptics";


import { RevealBar } from "./ScanAnimations";
import { ExpandableItemNameInput } from "./ExpandableItemNameInput";
import { BLOCK_STAGGER_MS, DIVISORS, ITEM_STAGGER_CAP_INDEX, ITEM_STAGGER_MS, MOUNT_START_DELAY_MS, PEOPLE_COUNTS, splitLabel } from "./presentation";
import { styles } from "./styles";
import type { useScanBillController } from "./useScanBillController";
type Props = Pick<ReturnType<typeof useScanBillController>, "tokens" | "space" | "radius" | "type" | "insets" | "setPhase" | "merchant" | "setMerchant" | "category" | "setCategory" | "items" | "peopleCount" | "feeItems" | "feeAggregate" | "hasFee" | "feeShare" | "billTotal" | "myShare" | "sharePct" | "updateItem" | "removeItem" | "addBlankItem" | "setAllMine" | "setPeopleCount" | "query" | "setQuery" | "selecting" | "selected" | "setSelected" | "categoryPickerOpen" | "setCategoryPickerOpen" | "selectedCategory" | "visibleItems" | "canProceed" | "toggleSelected" | "applyBulkDivisor">;
export function ScanReview({ tokens, space, radius, type, insets, setPhase, merchant, setMerchant, category, setCategory, items, peopleCount, feeItems, feeAggregate, hasFee, feeShare, billTotal, myShare, sharePct, updateItem, removeItem, addBlankItem, setAllMine, setPeopleCount, query, setQuery, selecting, selected, setSelected, categoryPickerOpen, setCategoryPickerOpen, selectedCategory, visibleItems, canProceed, toggleSelected, applyBulkDivisor }: Props) {
  const { formatMoney } = useCurrency()

  return (<>
    <View
      style={{
        paddingHorizontal: space.lg,
        paddingTop: 8,
        gap: space.md,
      }}
    >
      <PopIn play delay={MOUNT_START_DELAY_MS}>
        <Card elevated={false} style={{ gap: space.xs }}>
          <Text style={[styles.microLabel, { color: tokens.text3 }]}>
            YOUR SHARE
          </Text>
          <AmountText
            value={myShare}
            size={type.display}
            color={tokens.accent}
            animate
            ignoreHide
          />
          <View style={styles.spaceBetween}>
            <View style={{ flex: 1 }}>
              <RevealBar
                pct={sharePct}
                color={tokens.accent}
                trackColor={tokens.borderStrong}
                height={6}
              />
            </View>
          </View>
          <View style={styles.spaceBetween}>
            <Text
              style={{
                color: tokens.text3,
                fontFamily: fontFamily.bodySemiBold,
                fontSize: type.caption,
              }}
            >
              of {formatMoney(billTotal)} bill
            </Text>
            <Text
              style={{
                color: tokens.text3,
                fontFamily: fontFamily.bodyBold,
                fontSize: type.caption,
              }}
            >
              {sharePct}% yours
            </Text>
          </View>
        </Card>
      </PopIn>

      <PopIn
        play
        delay={MOUNT_START_DELAY_MS + BLOCK_STAGGER_MS}
        style={[styles.row, { gap: space.sm }]}
      >
        <View
          style={[
            styles.searchRow,
            {
              flex: 1,
              gap: space.sm,
              backgroundColor: tokens.inputBg,
              borderColor: tokens.border,
            },
          ]}
        >
          <MagnifyingGlass size={16} color={tokens.text3} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search items"
            placeholderTextColor={tokens.text3}
            style={[
              styles.searchInput,
              {
                color: tokens.text,
                fontFamily: fontFamily.bodyMedium,
                fontSize: type.body,
              },
            ]}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery("")}
              style={[
                styles.clearButton,
                { backgroundColor: tokens.border },
              ]}
            >
              <Text style={{ color: tokens.text2, fontSize: 12 }}>✕</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => {
            tap();
            setAllMine();
          }}
          style={[
            styles.allMineButton,
            {
              backgroundColor: tokens.inputBg,
              borderColor: tokens.border,
              borderRadius: radius.md,
            },
          ]}
        >
          <Text
            style={{
              color: tokens.text2,
              fontFamily: fontFamily.bodyBold,
              fontSize: type.caption,
            }}
          >
            All mine
          </Text>
        </Pressable>
      </PopIn>
    </View>

    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.body,
        { paddingHorizontal: space.lg, gap: space.md },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {visibleItems.length === 0 && items.length > 0 && (
        <Text
          style={{
            color: tokens.text3,
            fontFamily: fontFamily.bodyMedium,
            fontSize: type.body,
            textAlign: "center",
            paddingVertical: space.lg,
          }}
        >
          No items match &quot;{query}&quot;
        </Text>
      )}

      {visibleItems.map((it, i) => {
        const isSelected = selected.includes(it.key);
        return (
          <PopIn
            key={it.key}
            play
            delay={
              MOUNT_START_DELAY_MS +
              2 * BLOCK_STAGGER_MS +
              Math.min(i, ITEM_STAGGER_CAP_INDEX) * ITEM_STAGGER_MS
            }
            style={[
              styles.itemCard,
              {
                gap: space.sm,
                backgroundColor: tokens.card,
                borderRadius: radius.md,
              },
            ]}
          >
            {/* Hairline between items, centred in the list's gap so row spacing doesn't change. */}
            {i > 0 && (
              <View
                pointerEvents="none"
                style={{ position: "absolute", left: 0, right: 0, top: -space.md / 2, height: StyleSheet.hairlineWidth, backgroundColor: tokens.border }}
              />
            )}
            {selecting ? (
              <Pressable
                onPress={() => toggleSelected(it.key)}
                style={[styles.row, { gap: space.sm }]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderRadius: radius.sm,
                      borderColor: isSelected
                        ? tokens.accent
                        : tokens.border,
                      backgroundColor: isSelected
                        ? tokens.accent
                        : "transparent",
                    },
                  ]}
                >
                  {isSelected && (
                    <Check
                      size={13}
                      color={tokens.onAccent} weight="bold"
                    />
                  )}
                </View>
                <Text
                  style={{
                    flex: 1,
                    color: tokens.text,
                    fontFamily: fontFamily.bodyBold,
                    fontSize: type.body,
                  }}
                  numberOfLines={1}
                >
                  {it.name || "Item"}
                </Text>
                <Text
                  style={{
                    color: tokens.text2,
                    fontFamily: fontFamily.bodySemiBold,
                    fontSize: type.body,
                  }}
                >
                  {formatMoney(it.price)}
                </Text>
              </Pressable>
            ) : (
              <>
                <View
                  style={[
                    styles.row,
                    { justifyContent: "space-between" },
                  ]}
                >
                  <ExpandableItemNameInput
                    value={it.name}
                    onChangeText={(v) => updateItem(it.key, { name: v })}
                    color={tokens.text}
                    placeholderColor={tokens.text3}
                    fontSize={type.body}
                  />
                  <TextInput
                    value={String(round2(it.price / (it.divisor || 1)))}
                    onChangeText={(v) => {
                      const enteredShare =
                        Number(v.replace(/[^0-9.]/g, "")) || 0;
                      updateItem(it.key, {
                        price: round2(enteredShare * (it.divisor || 1)),
                      });
                    }}
                    keyboardType="decimal-pad"
                    style={{
                      color: tokens.accentInk,
                      fontFamily: fontFamily.bodyBold,
                      fontSize: type.body,
                      padding: 0,
                      minWidth: 40,
                      textAlign: "right",
                    }}
                  />
                </View>
                <View
                  style={[
                    styles.row,
                    { justifyContent: "space-between" },
                  ]}
                >
                  <View style={styles.row}>
                    <Text
                      style={{
                        color: tokens.text3,
                        fontFamily: fontFamily.bodySemiBold,
                        fontSize: type.caption,
                        marginRight: 6,
                      }}
                    >

                      {formatMoney(it.price)}
                    </Text>
                    <Text
                      style={{
                        color: tokens.text3,
                        fontFamily: fontFamily.bodySemiBold,
                        fontSize: type.caption,
                      }}
                    >
                      {it.divisor === 1
                        ? "· all yours"
                        : `· split ${it.divisor} ways`}
                    </Text>
                  </View>
                  <Text
                    style={[styles.microLabel, { color: tokens.text3 }]}
                  >
                    YOURS
                  </Text>
                </View>
                <View style={[styles.row, { gap: space.xs }]}>
                  {DIVISORS.map((d) => (
                    <Chip
                      key={d}
                      label={splitLabel(d)}
                      selected={it.divisor === d}
                      onPress={() => updateItem(it.key, { divisor: d })}
                      style={styles.itemSplitChip}
                    />
                  ))}
                  <Pressable
                    onPress={() => {
                      tap();
                      removeItem(it.key);
                    }}
                    hitSlop={8}
                    style={styles.deleteButton}
                    accessibilityLabel={`Remove ${it.name || "item"}`}
                  >
                    <Trash size={16} color={tokens.text3} />
                  </Pressable>
                </View>
              </>
            )}
          </PopIn>
        );
      })}

      <Pressable
        onPress={addBlankItem}
        style={[styles.addItem, { paddingVertical: space.sm }]}
      >
        <Plus size={16} color={tokens.accent} />
        <Text
          style={{
            color: tokens.accent,
            fontFamily: fontFamily.bodySemiBold,
            fontSize: type.body,
          }}
        >
          Add item
        </Text>
      </Pressable>

      {hasFee && (
        <PopIn play delay={MOUNT_START_DELAY_MS + 3 * BLOCK_STAGGER_MS}>
          <Card elevated={false} style={{ gap: space.sm }}>
            <View style={styles.spaceBetween}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: tokens.text,
                    fontFamily: fontFamily.displaySemiBold,
                    fontSize: type.body,
                  }}
                >
                  Fees &amp; discount
                </Text>
                <Text
                  style={{
                    color: tokens.text3,
                    fontFamily: fontFamily.bodySemiBold,
                    fontSize: type.caption,
                  }}
                >
                  Split equally across everyone on the bill
                </Text>
              </View>
              <Text
                style={{
                  color: tokens.text2,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.body,
                }}
              >
                {formatMoney(feeAggregate)}
              </Text>
            </View>
            {feeItems.length > 0 && (
              <View style={{ gap: space.xs }}>
                {feeItems.map((it) => (
                  <View key={it.key} style={[styles.row, { gap: space.xs }]}>
                    <ExpandableItemNameInput
                      value={it.name}
                      onChangeText={(name) => updateItem(it.key, { name })}
                      color={tokens.text2}
                      placeholderColor={tokens.text3}
                      fontSize={type.caption}
                      fillAvailableWidth
                    />
                    <TextInput
                      accessibilityLabel={`Fee amount for ${it.name || "fee"}`}
                      value={String(it.price)}
                      onChangeText={(value) => {
                        const price = Number(value.replace(/[^0-9.-]/g, ""));
                        updateItem(it.key, {
                          price: Number.isFinite(price) ? price : 0,
                        });
                      }}
                      keyboardType="decimal-pad"
                      style={{
                        color: tokens.text2,
                        fontFamily: fontFamily.bodySemiBold,
                        fontSize: type.caption,
                        minWidth: 48,
                        padding: 0,
                        textAlign: "right",
                      }}
                    />
                    <Pressable
                      accessibilityLabel={`Remove ${it.name || "fee"}`}
                      hitSlop={8}
                      onPress={() => removeItem(it.key)}
                      style={styles.feeDeleteButton}
                    >
                      <Trash size={14} color={tokens.text3} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            <View style={styles.spaceBetween}>
              <Text
                style={{
                  color: tokens.text2,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.caption,
                }}
              >
                People on this bill
              </Text>
              <View style={{ flexDirection: "row", gap: space.xs }}>
                {PEOPLE_COUNTS.map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    selected={peopleCount === n}
                    onPress={() => setPeopleCount(n)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.spaceBetween}>
              <Text
                style={{
                  color: tokens.text2,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.caption,
                }}
              >
                Your reconciled share
              </Text>
              <Text
                style={{
                  color: tokens.accentInk,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.caption,
                }}
              >
                {formatMoney(feeShare)}
              </Text>
            </View>
          </Card>
        </PopIn>
      )}

      <View
        style={[styles.divider, { backgroundColor: tokens.border }]}
      />

      <PopIn
        play
        delay={MOUNT_START_DELAY_MS + 4 * BLOCK_STAGGER_MS}
        style={[
          styles.row,
          { justifyContent: "space-between", gap: space.sm },
        ]}
      >
        <TextInput
          value={merchant}
          onChangeText={setMerchant}
          placeholder="Merchant"
          placeholderTextColor={tokens.text3}
          style={[
            styles.nameInput,
            {
              backgroundColor: tokens.inputBg,
              borderRadius: radius.md,
              color: tokens.text,
              fontFamily: fontFamily.bodyMedium,
              fontSize: type.body,
            },
          ]}
        />

        <Pressable
          onPress={() => setCategoryPickerOpen(true)}
          style={[
            styles.categoryPill,
            {
              backgroundColor: tokens.cardSolid,
              borderRadius: radius.full,
              borderWidth: 1,
              borderColor: tokens.border,
            },
          ]}
        >
          {selectedCategory ? (
            <>
              <CategoryIcon name={selectedCategory.name} icon={selectedCategory.icon} group={selectedCategory.group} size={type.caption} color={tokens.text} />
              <Text
                numberOfLines={1}
                style={{
                  flexShrink: 1,
                  marginLeft: space.xs,
                  color: tokens.text,
                  fontFamily: fontFamily.bodySemiBold,
                  fontSize: type.caption,
                }}
              >
                {splitEmoji(selectedCategory.name).text}
              </Text>
            </>
          ) : (
            <Text
              style={{
                color: tokens.text,
                fontFamily: fontFamily.bodySemiBold,
                fontSize: type.caption,
              }}
            >
              Category
            </Text>
          )}
        </Pressable>
      </PopIn>
    </ScrollView>

    <View
      style={[
        styles.footer,
        {
          paddingHorizontal: space.lg,
          paddingBottom: insets.bottom + space.lg,
          gap: space.sm,
        },
      ]}
    >
      {selecting && (
        <View
          style={[
            styles.bulkBar,
            {
              gap: space.sm,
              backgroundColor: tokens.card,
              borderRadius: radius.md,
            },
          ]}
        >
          <View style={styles.spaceBetween}>
            <Text
              style={{
                color: tokens.text,
                fontFamily: fontFamily.bodyBold,
                fontSize: type.caption,
              }}
            >
              {selected.length === 0
                ? "Tap rows to select"
                : `${selected.length} selected · set split to`}
            </Text>
            <Pressable onPress={() => setSelected([])}>
              <Text
                style={{
                  color: tokens.text3,
                  fontFamily: fontFamily.bodyBold,
                  fontSize: type.caption,
                }}
              >
                Clear
              </Text>
            </Pressable>
          </View>
          <View
            style={{
              flexDirection: "row",
              gap: space.xs,
              flexWrap: "wrap",
            }}
          >
            {DIVISORS.map((d) => (
              <Chip
                key={d}
                label={splitLabel(d)}
                onPress={() => applyBulkDivisor(d)}
              />
            ))}
          </View>
        </View>
      )}
      <Pressable
        onPress={() => canProceed && setPhase("confirm")}
        disabled={!canProceed}
        style={[
          styles.confirm,
          {
            backgroundColor: tokens.accent,
            borderRadius: radius.full,
            paddingVertical: space.md + 2,
            opacity: canProceed ? 1 : 0.5,
          },
        ]}
      >
        <Text
          style={{
            color: tokens.onAccent,
            fontFamily: fontFamily.bodyBold,
            fontSize: type.bodyLg,
          }}
        >
          Review {formatMoney(myShare)} →
        </Text>
      </Pressable>
    </View>

    <CategoryPickerSheet
      visible={categoryPickerOpen}
      onClose={() => setCategoryPickerOpen(false)}
      value={category}
      onSelect={setCategory}
      title="Choose a category"
      noneLabel="No category"
    />
  </>);
}
