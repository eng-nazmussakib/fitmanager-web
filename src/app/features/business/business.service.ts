import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiService } from '@core/http/api.service';
import type {
    CartLine,
    DeliveryInput,
    Equipment,
    EquipmentDetail,
    EquipmentInput,
    EquipmentList,
    HqStock,
    Ledger,
    PoInput,
    PosProduct,
    PosQuote,
    PosReturnInput,
    PosSale,
    PosSaleInput,
    PosSaleResult,
    Product,
    ProductInput,
    PurchaseOrder,
    ServiceInput,
    StockElsewhere,
    StockList,
    StockTransfer,
    Supplier,
    SupplierInput,
    Ticket,
    TicketInput,
    TicketUpdate,
    TransferInput
} from '@core/models/business.model';

/**
 * The phase 6 calls (D-098 to D-102): the equipment register and tickets, HQ's catalogue and suppliers, each branch's
 * stock, purchase orders, transfers and the POS. The branch (or HQ) is in `X-Branch-Id`.
 */
@Injectable({ providedIn: 'root' })
export class BusinessService {
    private readonly _api = inject(ApiService);

    /* ---------- equipment (D-098) ---------- */

    rooms(): Observable<{ oid: string; name: string }[]> {
        return this._api.get<{ oid: string; name: string }[]>('/v1/rooms');
    }

    equipment(q: { status?: string; due?: boolean; q?: string } = {}): Observable<EquipmentList> {
        return this._api.get<EquipmentList>('/v1/equipment', { status: q.status, due: q.due ? '1' : undefined, q: q.q });
    }

    equipmentDetail(oid: string): Observable<EquipmentDetail> {
        return this._api.get<EquipmentDetail>(`/v1/equipment/${oid}`);
    }

    addEquipment(body: EquipmentInput): Observable<Equipment> {
        return this._api.post<Equipment>('/v1/equipment', body);
    }

    updateEquipment(oid: string, body: Partial<EquipmentInput>): Observable<Equipment> {
        return this._api.patch<Equipment>(`/v1/equipment/${oid}`, body);
    }

    retire(oid: string, reason: string): Observable<Equipment> {
        return this._api.post<Equipment>(`/v1/equipment/${oid}/retire`, { reason });
    }

    recordService(oid: string, body: ServiceInput): Observable<EquipmentDetail> {
        return this._api.post<EquipmentDetail>(`/v1/equipment/${oid}/service`, body);
    }

    tickets(status: 'open' | 'closed' | 'all' = 'open'): Observable<Ticket[]> {
        return this._api.get<Ticket[]>('/v1/equipment-tickets', { status });
    }

    raiseTicket(equipmentOid: string, body: TicketInput): Observable<Ticket> {
        return this._api.post<Ticket>(`/v1/equipment/${equipmentOid}/tickets`, body);
    }

    updateTicket(oid: string, body: TicketUpdate): Observable<Ticket> {
        return this._api.patch<Ticket>(`/v1/equipment-tickets/${oid}`, body);
    }

    /* ---------- catalogue (D-099) ---------- */

    products(all = false): Observable<Product[]> {
        return this._api.get<Product[]>('/v1/products', all ? { all: '1' } : undefined);
    }

    addProduct(body: ProductInput): Observable<Product> {
        return this._api.post<Product>('/v1/hq/products', body);
    }

    updateProduct(oid: string, body: Partial<ProductInput>): Observable<Product> {
        return this._api.patch<Product>(`/v1/hq/products/${oid}`, body);
    }

    suppliers(all = false): Observable<Supplier[]> {
        return this._api.get<Supplier[]>('/v1/suppliers', all ? { all: '1' } : undefined);
    }

    addSupplier(body: SupplierInput): Observable<Supplier> {
        return this._api.post<Supplier>('/v1/hq/suppliers', body);
    }

    updateSupplier(oid: string, body: Partial<SupplierInput>): Observable<Supplier> {
        return this._api.patch<Supplier>(`/v1/hq/suppliers/${oid}`, body);
    }

    /* ---------- stock (D-101) ---------- */

    stock(q: { low?: boolean; q?: string } = {}): Observable<StockList> {
        return this._api.get<StockList>('/v1/stock', { low: q.low ? '1' : undefined, q: q.q });
    }

    ledger(productOid: string): Observable<Ledger> {
        return this._api.get<Ledger>(`/v1/stock/${productOid}/movements`);
    }

    adjust(productOid: string, body: { qty: number; reason: string; note?: string | null }): Observable<{ product_oid: string; on_hand: number }> {
        return this._api.post(`/v1/stock/${productOid}/adjust`, body);
    }

    setReorderLevel(productOid: string, level: number): Observable<{ product_oid: string; reorder_level: number; low: boolean }> {
        return this._api.put(`/v1/stock/${productOid}/reorder-level`, { reorder_level: level });
    }

    elsewhere(productOids: string[]): Observable<StockElsewhere[]> {
        return this._api.get<StockElsewhere[]>('/v1/stock/elsewhere', { product_oid: productOids });
    }

    hqStock(): Observable<HqStock> {
        return this._api.get<HqStock>('/v1/hq/stock');
    }

    /* ---------- purchase orders (D-100) ---------- */

    orders(q: { status?: string; branch_oid?: string } = {}): Observable<PurchaseOrder[]> {
        return this._api.get<PurchaseOrder[]>('/v1/purchase-orders', q);
    }

    order(oid: string): Observable<PurchaseOrder> {
        return this._api.get<PurchaseOrder>(`/v1/purchase-orders/${oid}`);
    }

    raiseOrder(body: PoInput): Observable<PurchaseOrder> {
        return this._api.post<PurchaseOrder>('/v1/purchase-orders', body);
    }

    decide(oid: string, approve: boolean, note: string | null): Observable<PurchaseOrder> {
        return this._api.post<PurchaseOrder>(`/v1/hq/purchase-orders/${oid}/${approve ? 'approve' : 'reject'}`, { note });
    }

    markSent(oid: string): Observable<PurchaseOrder> {
        return this._api.post<PurchaseOrder>(`/v1/purchase-orders/${oid}/sent`, {});
    }

    receive(oid: string, body: DeliveryInput): Observable<PurchaseOrder> {
        return this._api.post<PurchaseOrder>(`/v1/purchase-orders/${oid}/deliveries`, body);
    }

    cancelOrder(oid: string, reason: string): Observable<PurchaseOrder> {
        return this._api.post<PurchaseOrder>(`/v1/purchase-orders/${oid}/cancel`, { reason });
    }

    /* ---------- transfers (D-101) ---------- */

    transfers(direction: 'in' | 'out' | 'all' = 'all'): Observable<StockTransfer[]> {
        return this._api.get<StockTransfer[]>('/v1/transfers', { direction });
    }

    askTransfer(body: TransferInput): Observable<StockTransfer> {
        return this._api.post<StockTransfer>('/v1/transfers', body);
    }

    sendTransfer(oid: string, lines: { line_oid: string; qty: number }[], note: string | null): Observable<StockTransfer> {
        return this._api.post<StockTransfer>(`/v1/transfers/${oid}/send`, { lines, note });
    }

    receiveTransfer(oid: string, lines: { line_oid: string; qty: number }[], note: string | null): Observable<StockTransfer> {
        return this._api.post<StockTransfer>(`/v1/transfers/${oid}/receive`, { lines, note });
    }

    closeTransfer(oid: string, how: 'reject' | 'cancel', note: string): Observable<StockTransfer> {
        return this._api.post<StockTransfer>(`/v1/transfers/${oid}/${how}`, { note });
    }

    /* ---------- POS (D-102) ---------- */

    posProducts(): Observable<PosProduct[]> {
        return this._api.get<PosProduct[]>('/v1/pos/products');
    }

    quote(memberOid: string | null, lines: CartLine[]): Observable<PosQuote> {
        return this._api.post<PosQuote>('/v1/pos/quote', { member_oid: memberOid, lines }, { notify: 'none' });
    }

    sell(body: PosSaleInput): Observable<PosSaleResult> {
        return this._api.post<PosSaleResult>('/v1/pos/sales', body);
    }

    sales(q: { day?: string; q?: string } = {}): Observable<PosSale[]> {
        return this._api.get<PosSale[]>('/v1/pos/sales', q);
    }

    sale(oid: string): Observable<PosSale> {
        return this._api.get<PosSale>(`/v1/pos/sales/${oid}`);
    }

    returnItems(oid: string, body: PosReturnInput): Observable<PosSale> {
        return this._api.post<PosSale>(`/v1/pos/sales/${oid}/return`, body);
    }
}
