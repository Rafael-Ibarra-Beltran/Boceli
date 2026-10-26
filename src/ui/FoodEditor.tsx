import React from 'react';
import { View } from 'react-native';
import * as Crypto from 'expo-crypto';
import type { FoodItem, Unit } from '../domain/types';
import { itemKcal, parseNumber } from '../domain/calculations';
import { foodItemSchema } from '../domain/validation';
import { Button, Choice, Copy, Field } from './components';
import { theme as t } from './tokens';

export interface ItemDraft { item: FoodItem; quantity: string; base: string; energy: string }
export function draftItem(item?: FoodItem, askQuantity = false): ItemDraft {
  const value: FoodItem = item ?? { id: Crypto.randomUUID(), name: '', quantity: 1, unit: 'portion', basisQuantity: 1, basisKcal: 0, source: 'manual', sourceDetail: 'Entrada manual', estimated: false, portionLabel: 'porción' };
  return { item: { ...value, id: Crypto.randomUUID() }, quantity: askQuantity ? '' : String(value.quantity), base: String(value.basisQuantity), energy: item ? String(value.basisKcal) : '' };
}
export function resolveDraft(draft: ItemDraft): FoodItem {
  const quantity = parseNumber(draft.quantity);
  const basisQuantity = parseNumber(draft.base);
  const basisKcal = parseNumber(draft.energy);
  if (quantity === null || basisQuantity === null || basisKcal === null) throw new Error('Completa cuánto consumiste, la base y las calorías de cada alimento.');
  const result = foodItemSchema.safeParse({ ...draft.item, quantity, basisQuantity, basisKcal });
  if (!result.success) throw new Error('Revisa nombre, cantidad y base energética. Las cantidades deben ser mayores que cero.');
  return result.data;
}
const origin = { ai: 'Estimación IA', label: 'Etiqueta leída con IA', off: 'Open Food Facts', manual: 'Entrada manual' };
export function FoodEditor({ draft, onChange, onRemove }: { draft: ItemDraft; onChange: (draft: ItemDraft) => void; onRemove: () => void }) {
  const change = (values: Partial<ItemDraft>) => onChange({ ...draft, ...values });
  const patch = (values: Partial<FoodItem>) => change({ item: { ...draft.item, ...values } });
  const setUnit = (unit: Unit) => {
    if (unit === draft.item.unit) return;
    const { equivalentQuantity, equivalentUnit, equivalenceSource, ...item } = draft.item;
    void equivalentQuantity; void equivalentUnit; void equivalenceSource;
    onChange({ item: { ...item, unit, portionLabel: unit === 'portion' ? 'porción' : undefined, sourceDetail: `${origin[item.source]}; unidad corregida por usuario` }, quantity: '', base: unit === 'portion' ? '1' : '100', energy: '' });
  };
  let preview = '';
  try { preview = `${Math.round(itemKcal(resolveDraft(draft)))} kcal`; } catch { /* Incomplete fields remain editable. */ }
  return <View style={{ padding: 16, marginBottom: 14, borderRadius: t.radius.md, borderWidth: 1, borderColor: t.rule, backgroundColor: t.surface, gap: 2 }}>
    <View style={{ marginBottom: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <View style={{ maxWidth: '100%', flexShrink: 1 }}><Copy muted size={12}>{origin[draft.item.source]}{draft.item.estimated ? ' · aproximado' : ''}</Copy></View>
      {preview ? <View style={{ maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 5, borderRadius: t.radius.sm, backgroundColor: t.surfaceTint }}><Copy bold size={13}>{preview}</Copy></View> : null}
    </View>
    {draft.item.source === 'label' && <Copy muted size={12}>{draft.item.sourceDetail}</Copy>}
    <Field label="Alimento" value={draft.item.name} onChangeText={name => patch({ name })} placeholder="Ej.: avena" maxLength={160} />
    <Copy bold size={13}>Unidad</Copy>
    <Choice<Unit> value={draft.item.unit} options={[{ value: 'g', label: 'Gramos' }, { value: 'ml', label: 'Mililitros' }, { value: 'portion', label: 'Porciones' }]} onChange={setUnit} />
    {draft.item.unit === 'portion' && <Field label="Qué es una porción" value={draft.item.portionLabel ?? ''} onChangeText={portionLabel => patch({ portionLabel })} placeholder="Ej.: una pieza" maxLength={120} />}
    <Field label={`Cantidad consumida (${draft.item.unit === 'portion' ? 'porciones' : draft.item.unit})`} value={draft.quantity} onChangeText={quantity => change({ quantity })} keyboardType="decimal-pad" placeholder="Ej.: 1" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 140 }}><Field label="Calorías (kcal)" value={draft.energy} onChangeText={energy => change({ energy, item: { ...draft.item, sourceDetail: `${origin[draft.item.source]}; calorías revisadas manualmente` } })} keyboardType="decimal-pad" placeholder="Ej.: 120" /></View>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 140, minWidth: 140 }}><Field label={`Por cuántos ${draft.item.unit === 'portion' ? 'porciones' : draft.item.unit}`} value={draft.base} onChangeText={base => change({ base })} keyboardType="decimal-pad" placeholder="Ej.: 100" /></View>
    </View>
    {draft.item.equivalentQuantity && <Copy muted size={12}>1 porción = {draft.item.equivalentQuantity} {draft.item.equivalentUnit}. Fuente: {draft.item.equivalenceSource}. No se convierte automáticamente entre unidades.</Copy>}
    <View style={{ marginTop: 4, alignItems: 'flex-end' }}><Button icon="trash-outline" title="Eliminar alimento" variant="danger" style={{ alignSelf: 'flex-end' }} onPress={onRemove} /></View>
  </View>;
}
