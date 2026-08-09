// ─── ESTIMATE → INVOICE ──────────────────────────────────────────────────────
// One workflow, three stages, one document underneath.
//
// Invoice is NOT a separate tool and is deliberately not a tab. It is the last
// stage of the Material Estimator, reached by an explicit act, because an
// estimate that quietly becomes a bill is how somebody gets charged for a
// number they thought was a guess.
//
// Every total comes from core/domain/money.computeTotals and every conversion
// from documents.convertEstimateToInvoice. This file renders; it does no
// arithmetic of its own. Two ideas of what a job costs is exactly how an
// invoice ends up disagreeing with the estimate it came from.

import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Alert, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { formatMoney, toCents, lineTotalCents, computeTotals, LineItemKind } from '../core/domain/money';
import {
  createEstimate, createInvoice, convertEstimateToInvoice, transition,
  EstimateStatus, InvoiceStatus, generateToken, formatDocumentNumber,
} from '../core/domain/documents';
import {
  estimateLineItems, stepQuantity, offlinePayment, balance, OFFLINE_METHODS,
  OFFLINE_PAYMENT_NOTICE, onlinePaymentsAvailable, hostedInvoiceUrl,
} from '../core/domain/estimateBridge';

const Stage = { MATERIALS: 'MATERIALS', SUMMARY: 'SUMMARY', INVOICE: 'INVOICE' };

const randomBytes = (n) => {
  const out = new Uint8Array(n);
  // Not crypto-grade on every RN runtime, so the token is generated on the
  // device that owns the invoice and never treated as an auth secret on its
  // own — the hosted page must still check it server-side when it exists.
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

const nowIso = () => new Date().toISOString();

export default function EstimateScreen({ C, quantities, projectName = '', projectAddress = '', onClose, onSaveToProject }) {
  const [stage, setStage] = useState(Stage.MATERIALS);
  const [items, setItems] = useState(() => estimateLineItems(quantities).map((i) => ({ ...i })));
  const [taxPercent, setTaxPercent] = useState('0');
  const [labourHours, setLabourHours] = useState('0');
  const [labourRate, setLabourRate] = useState('0');
  const [markupPercent, setMarkupPercent] = useState('0');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [invoice, setInvoice] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');

  const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };

  // Every figure comes from the shared model. Nothing is added up here.
  const totals = useMemo(() => computeTotals({
    lineItems: items,
    taxPercent: num(taxPercent),
    discountPercent: num(discountPercent),
    payments,
  }), [items, taxPercent, discountPercent, payments]);

  const bal = useMemo(
    () => balance({ totalCents: totals.totalCents, payments }),
    [totals.totalCents, payments],
  );

  const setQty = (id, delta) => setItems((list) => list.map((i) => (
    i.id === id ? { ...i, quantity: stepQuantity(i.quantity, delta) } : i
  )));

  const setPrice = (id, text) => setItems((list) => list.map((i) => (
    i.id === id ? { ...i, unitPriceCents: toCents(text) } : i
  )));

  const removeItem = (id) => setItems((list) => list.filter((i) => i.id !== id));

  const addLabour = () => {
    const h = num(labourHours);
    const r = num(labourRate);
    if (!h || !r) { Alert.alert('Labour', 'Enter both hours and an hourly rate.'); return; }
    setItems((list) => [
      ...list.filter((i) => i.kind !== LineItemKind.LABOR),
      { id: 'labour', kind: LineItemKind.LABOR, description: 'Labour', detail: `${h} hr @ ${r.toFixed(2)}/hr`, quantity: h, unit: 'hr', unitPriceCents: toCents(r) },
    ]);
  };

  /**
   * The one place an estimate becomes a bill, and it is a deliberate act.
   *
   * The estimate is walked SENT → ACCEPTED first because the model refuses to
   * convert anything else. The invoice receives a copy of the line items, so
   * editing it afterwards cannot rewrite what the customer agreed to.
   */
  const createTheInvoice = () => {
    const at = nowIso();
    let est = createEstimate({
      id: `e${Date.now()}`, number: formatDocumentNumber('EST', 1, new Date().getFullYear()),
      createdAt: at, lineItems: items.map((i) => ({ ...i })),
      taxPercent: num(taxPercent), discountPercent: num(discountPercent),
      customer: { id: 'c1', name: projectName || 'Customer' },
    });
    est = transition(est, EstimateStatus.SENT, { at }).doc ?? est;
    est = transition(est, EstimateStatus.ACCEPTED, { at }).doc ?? est;

    const res = convertEstimateToInvoice(est, {
      id: `i${Date.now()}`, number: formatDocumentNumber('INV', 1, new Date().getFullYear()), at,
    });
    if (!res.invoice) { Alert.alert('Could not create invoice', res.error ?? 'Unknown problem.'); return; }
    setInvoice({ ...res.invoice, shareToken: generateToken(randomBytes, 22) });
    setStage(Stage.INVOICE);
  };

  const recordPay = () => {
    const p = offlinePayment({ amount: payAmount, method: payMethod });
    if (!p) { Alert.alert('Check that amount', 'Enter the amount you were paid — more than zero.'); return; }
    setPayments((list) => [...list, p]);
    setPayAmount('');
  };

  const share = async () => {
    const link = invoice?.shareToken ? hostedInvoiceUrl(invoice.shareToken) : null;
    const lines = [
      `${invoice ? 'INVOICE' : 'ESTIMATE'}${invoice ? ` ${invoice.number}` : ''}`,
      projectName || '',
      '',
      ...items.map((i) => `${i.description}  ${i.quantity} ${i.unit ?? ''}  ${formatMoney(lineTotalCents(i))}`),
      '',
      `Subtotal  ${formatMoney(totals.subtotalCents)}`,
      `Tax       ${formatMoney(totals.taxCents)}`,
      `Total     ${formatMoney(totals.totalCents)}`,
      ...(bal.amountPaidCents > 0 ? [`Paid      ${formatMoney(bal.amountPaidCents)}`, `Due       ${formatMoney(bal.amountDueCents)}`] : []),
      ...(link ? ['', link] : []),
    ];
    try { await Share.share({ message: lines.filter((l) => l !== null).join('\n') }); } catch (e) { /* user cancelled */ }
  };

  const Seg = ({ id, label, enabled = true }) => {
    const on = stage === id;
    return (
      <TouchableOpacity
        onPress={() => enabled && setStage(id)}
        disabled={!enabled}
        accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !enabled }}
        style={{
          flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: 'center',
          backgroundColor: on ? C.blue : 'transparent', opacity: enabled ? 1 : 0.4,
        }}>
        <Text style={{ fontSize: 12, fontWeight: on ? '800' : '600', color: on ? '#fff' : C.textSec }}>{label}</Text>
      </TouchableOpacity>
    );
  };

  const Row = ({ label, value, strong, tone }) => (
    <View style={{ flexDirection: 'row', paddingVertical: 6 }}>
      <Text style={{ flex: 1, fontSize: strong ? 14 : 12.5, fontWeight: strong ? '800' : '500', color: strong ? C.text : C.textSec }}>{label}</Text>
      <Text style={{ fontSize: strong ? 16 : 12.5, fontWeight: strong ? '900' : '600', color: tone ?? (strong ? C.green : C.text) }}>{value}</Text>
    </View>
  );

  const Money = ({ value, onChange, placeholder }) => (
    <TextInput value={value} onChangeText={onChange} keyboardType="decimal-pad" placeholder={placeholder}
      placeholderTextColor={C.placeholder}
      style={{ backgroundColor: C.inputBg, borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, color: C.inputText, fontSize: 13.5, borderWidth: 1, borderColor: C.border, minWidth: 84, textAlign: 'right' }} />
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Back to quantities">
          <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: C.text }}>
            {stage === Stage.INVOICE ? 'Invoice' : 'Estimate'}
          </Text>
          <Text style={{ fontSize: 11.5, color: C.textTert }}>{projectName || 'Not saved to a project yet'}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderRadius: 11, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
        <Seg id={Stage.MATERIALS} label="MATERIALS" />
        <Seg id={Stage.SUMMARY} label="SUMMARY" />
        {/* Not reachable until an invoice exists. An estimate must never look
            like a bill by accident. */}
        <Seg id={Stage.INVOICE} label="INVOICE" enabled={!!invoice} />
      </View>

      {stage === Stage.MATERIALS && (
        <>
          <View style={{ backgroundColor: C.amberBg, borderRadius: 10, padding: 11, marginBottom: 14, borderLeftWidth: 3, borderLeftColor: C.amber }}>
            <Text style={{ fontSize: 11.5, color: C.text, lineHeight: 16 }}>
              ROUGH ESTIMATE ONLY — for planning purposes. Always verify on site before ordering.
            </Text>
          </View>

          {items.length === 0 ? (
            <Text style={{ fontSize: 12.5, color: C.textTert, lineHeight: 19 }}>
              No quantities entered. Go back and add at least one.
            </Text>
          ) : items.map((i) => (
            <View key={i.id} style={{ backgroundColor: C.surface, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.text }}>{i.description}</Text>
                  <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 2 }}>{i.detail}</Text>
                </View>
                <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.green }}>{formatMoney(lineTotalCents(i))}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 11 }}>
                <TouchableOpacity onPress={() => setQty(i.id, -1)} accessibilityRole="button" accessibilityLabel={`One fewer ${i.description}`}
                  style={{ width: 44, height: 44, borderRadius: 9, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
                  <Ionicons name="remove" size={17} color={C.textSec} />
                </TouchableOpacity>
                <Text style={{ minWidth: 46, textAlign: 'center', fontSize: 15, fontWeight: '800', color: C.text }}>{i.quantity}</Text>
                <TouchableOpacity onPress={() => setQty(i.id, 1)} accessibilityRole="button" accessibilityLabel={`One more ${i.description}`}
                  style={{ width: 44, height: 44, borderRadius: 9, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }}>
                  <Ionicons name="add" size={17} color={C.textSec} />
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: C.textTert }}>{i.unit}</Text>
                <View style={{ flex: 1 }} />
                <Money value={i.unitPriceCents ? (i.unitPriceCents / 100).toString() : ''} onChange={(t) => setPrice(i.id, t)} placeholder="0.00" />
                <TouchableOpacity onPress={() => removeItem(i.id)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={`Remove ${i.description}`}>
                  <Ionicons name="close" size={16} color={C.textTert} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* No price catalogue exists, so a zero is honest and a plausible
              default would be a number a supplier gets quoted against. */}
          <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 6, lineHeight: 15 }}>
            Prices start at zero because SparkConnect has no price list of its own. Enter what your
            supplier charges, or use the SparkAI estimate — which is estimated, not quoted.
          </Text>

          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.border }}>
            <Row label="Material subtotal" value={formatMoney(totals.subtotalCents)} />
            <Row label={`Tax (${num(taxPercent)}%)`} value={formatMoney(totals.taxCents)} />
            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 7 }} />
            <Row label="Estimated total" value={formatMoney(totals.totalCents)} strong />
          </View>

          <TouchableOpacity onPress={() => setStage(Stage.SUMMARY)} activeOpacity={0.88}
            accessibilityRole="button"
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#fff' }}>Next: Summary</Text>
          </TouchableOpacity>
        </>
      )}

      {stage === Stage.SUMMARY && (
        <>
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginBottom: 9 }}>
            OPTIONAL — ALL DEFAULT TO ZERO
          </Text>
          {[
            { label: 'Labour hours', v: labourHours, set: setLabourHours },
            { label: 'Labour rate / hr', v: labourRate, set: setLabourRate },
            { label: 'Tax %', v: taxPercent, set: setTaxPercent },
            { label: 'Markup %', v: markupPercent, set: setMarkupPercent },
            { label: 'Discount %', v: discountPercent, set: setDiscountPercent },
          ].map((f) => (
            <View key={f.label} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 11, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: C.border }}>
              <Text style={{ flex: 1, fontSize: 13, color: C.text, fontWeight: '600' }}>{f.label}</Text>
              <Money value={f.v} onChange={f.set} placeholder="0" />
            </View>
          ))}

          <TouchableOpacity onPress={addLabour} accessibilityRole="button"
            style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSec }}>Add labour to the estimate</Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border }}>
            <Row label="Subtotal" value={formatMoney(totals.subtotalCents)} />
            <Row label="Discount" value={`-${formatMoney(totals.discountCents)}`} />
            <Row label="Tax" value={formatMoney(totals.taxCents)} />
            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 7 }} />
            <Row label="Estimate total" value={formatMoney(totals.totalCents)} strong />
          </View>

          <TouchableOpacity onPress={share} accessibilityRole="button"
            style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.textSec }}>Share estimate</Text>
          </TouchableOpacity>

          {onSaveToProject ? (
            <TouchableOpacity onPress={() => onSaveToProject({ items, totals })} accessibilityRole="button"
              style={{ borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 9 }}>
              <Text style={{ fontSize: 13.5, fontWeight: '700', color: C.textSec }}>Save to project</Text>
            </TouchableOpacity>
          ) : null}

          {/* The deliberate act. An estimate that quietly becomes a bill is how
              somebody gets charged for a number they thought was a guess. */}
          <TouchableOpacity onPress={createTheInvoice} activeOpacity={0.88} accessibilityRole="button"
            style={{ backgroundColor: C.amber, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#1A1408' }}>Create Invoice</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 8, textAlign: 'center', lineHeight: 15 }}>
            This turns the estimate into a bill. The estimate is kept as it is.
          </Text>
        </>
      )}

      {stage === Stage.INVOICE && invoice && (
        <>
          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 14 }}>
            <Text style={{ fontSize: 10, fontWeight: '900', color: C.amber, letterSpacing: 0.8 }}>INVOICE</Text>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginTop: 3 }}>{invoice.number}</Text>
            <Text style={{ fontSize: 11.5, color: C.textTert, marginTop: 2 }}>
              From estimate · {new Date(invoice.issueDate ?? Date.now()).toLocaleDateString()}
            </Text>
          </View>

          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border }}>
            {invoice.lineItems.map((i) => (
              <View key={i.id} style={{ flexDirection: 'row', paddingVertical: 6 }}>
                <Text style={{ flex: 1, fontSize: 12.5, color: C.text }} numberOfLines={1}>{i.description}</Text>
                <Text style={{ fontSize: 12, color: C.textTert, marginRight: 10 }}>{i.quantity}</Text>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: C.text }}>{formatMoney(lineTotalCents(i))}</Text>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: C.border, marginVertical: 8 }} />
            <Row label="Total" value={formatMoney(totals.totalCents)} strong />
            {bal.amountPaidCents > 0 ? (
              <>
                <Row label="Paid" value={formatMoney(bal.amountPaidCents)} tone={C.green} />
                <Row label="Amount due" value={formatMoney(bal.amountDueCents)} strong tone={bal.paidInFull ? C.green : C.amber} />
              </>
            ) : null}
            {bal.paidInFull ? (
              <View style={{ backgroundColor: C.greenBg ?? C.tealBg, borderRadius: 9, padding: 10, marginTop: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '900', color: C.green }}>PAID</Text>
              </View>
            ) : null}
          </View>

          {/* Recording, never processing. */}
          <Text style={{ fontSize: 10.5, fontWeight: '800', color: C.textSec, letterSpacing: 0.6, marginTop: 20, marginBottom: 8 }}>
            RECORD A PAYMENT
          </Text>
          <View style={{ backgroundColor: C.surface, borderRadius: 12, padding: 13, borderWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row', gap: 7, marginBottom: 11 }}>
              {OFFLINE_METHODS.map((m) => {
                const on = payMethod === m.id;
                return (
                  <TouchableOpacity key={m.id} onPress={() => setPayMethod(m.id)}
                    accessibilityRole="radio" accessibilityState={{ selected: on }}
                    style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center', backgroundColor: on ? C.blueSub : C.inputBg, borderWidth: 1.5, borderColor: on ? C.blue : C.border }}>
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? C.blue : C.textSec }}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <View style={{ flex: 1 }}>
                <Money value={payAmount} onChange={setPayAmount} placeholder="Amount received" />
              </View>
              <TouchableOpacity onPress={recordPay} accessibilityRole="button"
                style={{ backgroundColor: C.blue, borderRadius: 9, paddingHorizontal: 20, justifyContent: 'center' }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#fff' }}>Record</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 10, lineHeight: 15 }}>
              {OFFLINE_PAYMENT_NOTICE}
            </Text>
          </View>

          {payments.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              {payments.map((p) => (
                <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 10, padding: 11, marginBottom: 6, borderWidth: 1, borderColor: C.border }}>
                  <Ionicons name="cash-outline" size={15} color={C.green} />
                  <Text style={{ flex: 1, fontSize: 12.5, color: C.text, marginLeft: 9 }}>
                    {OFFLINE_METHODS.find((m) => m.id === p.method)?.label} · {new Date(p.at).toLocaleDateString()}
                  </Text>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: C.green }}>{formatMoney(p.amountCents)}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity onPress={share} activeOpacity={0.88} accessibilityRole="button"
            style={{ backgroundColor: C.blue, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 18 }}>
            <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#fff' }}>Send to customer</Text>
          </TouchableOpacity>

          {/* Nothing that takes a card renders until a provider is configured
              and tested. onlinePaymentsAvailable() is false and there is no
              provider to make it true. */}
          {onlinePaymentsAvailable() ? null : (
            <Text style={{ fontSize: 10.5, color: C.textTert, marginTop: 10, textAlign: 'center', lineHeight: 15 }}>
              Customers pay you directly. SparkConnect does not process payments and holds no card
              or bank details.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
