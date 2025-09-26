import { describe, it, expect, beforeEach } from "vitest";
import { ClarityValue, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_CLASS = 101;
const ERR_INSUFFICIENT_FUNDS = 102;
const ERR_PAYMENT_FAILED = 103;
const ERR_INVALID_AMOUNT = 104;
const ERR_CLASS_NOT_ACTIVE = 105;
const ERR_ALREADY_PAID = 106;
const ERR_FEE_TRANSFER_FAILED = 107;
const ERR_INSTRUCTOR_TRANSFER_FAILED = 108;
const ERR_INVALID_FEE_PERCENT = 109;
const ERR_NO_FEE_VAULT = 110;
const ERR_NO_CLASS_REGISTRY = 111;
const ERR_INVALID_TIMESTAMP = 112;
const ERR_PAYMENT_EXPIRED = 113;
const ERR_REFUND_FAILED = 114;
const ERR_DISPUTE_OPEN = 115;
const ERR_NO_PAYMENT_FOUND = 116;
const ERR_INVALID_REFUND_AMOUNT = 117;
const ERR_ONLY_INSTRUCTOR = 118;
const ERR_ONLY_PARTICIPANT = 119;
const ERR_PLATFORM_FEE_ZERO = 120;
const ERR_MAX_PAYMENTS_EXCEEDED = 121;
const ERR_INVALID_CURRENCY = 122;
const ERR_DISPUTE_NOT_ALLOWED = 123;
const ERR_RESOLVE_FAILED = 124;
const ERR_INVALID_DISPUTE_REASON = 125;

interface Payment {
  classId: number;
  participant: string;
  amount: number;
  timestamp: number;
  instructor: string;
  status: string;
  currency: string;
  refunded: boolean;
}

interface Dispute {
  reason: string;
  timestamp: number;
  resolved: boolean;
  resolver: string;
  outcome: string;
}

interface ClassDetails {
  price: number;
  instructor: string;
  active: boolean;
  startTime: number;
}

type Result<T> = { ok: boolean; value: T };

class PaymentProcessorMock {
  state: {
    feeVaultAddress: string;
    classRegistryAddress: string;
    nextPaymentId: number;
    totalFeesCollected: number;
    totalPaymentsProcessed: number;
    platformFeePercent: number;
    maxPayments: number;
    payments: Map<number, Payment>;
    paymentsByClass: Map<number, number[]>;
    disputes: Map<number, Dispute>;
    paymentCountsByClass: Map<number, number>;
  } = {
    feeVaultAddress: "SP000000000000000000002Q6VF78",
    classRegistryAddress: "SP000000000000000000002Q6VF78",
    nextPaymentId: 0,
    totalFeesCollected: 0,
    totalPaymentsProcessed: 0,
    platformFeePercent: 2,
    maxPayments: 10000,
    payments: new Map(),
    paymentsByClass: new Map(),
    disputes: new Map(),
    paymentCountsByClass: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];
  classDetails: Map<number, ClassDetails> = new Map();

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      feeVaultAddress: "SP000000000000000000002Q6VF78",
      classRegistryAddress: "SP000000000000000000002Q6VF78",
      nextPaymentId: 0,
      totalFeesCollected: 0,
      totalPaymentsProcessed: 0,
      platformFeePercent: 2,
      maxPayments: 10000,
      payments: new Map(),
      paymentsByClass: new Map(),
      disputes: new Map(),
      paymentCountsByClass: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
    this.classDetails = new Map();
  }

  setFeeVaultAddress(newAddress: string): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.feeVaultAddress = newAddress;
    return { ok: true, value: true };
  }

  setClassRegistryAddress(newAddress: string): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.classRegistryAddress = newAddress;
    return { ok: true, value: true };
  }

  setPlatformFeePercent(newPercent: number): Result<boolean> {
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newPercent <= 0 || newPercent > 10) return { ok: false, value: ERR_INVALID_FEE_PERCENT };
    this.state.platformFeePercent = newPercent;
    return { ok: true, value: true };
  }

  getClassDetails(classId: number): Result<ClassDetails> {
    const details = this.classDetails.get(classId);
    if (!details) return { ok: false, value: ERR_INVALID_CLASS };
    return { ok: true, value: details };
  }

  payForClass(classId: number, currency: string): Result<number> {
    if (currency !== "STX") return { ok: false, value: ERR_INVALID_CURRENCY };
    const classRes = this.getClassDetails(classId);
    if (!classRes.ok) return { ok: false, value: classRes.value as number };
    const classDetails = classRes.value;
    if (!classDetails.active) return { ok: false, value: ERR_CLASS_NOT_ACTIVE };
    if (classDetails.startTime < this.blockHeight) return { ok: false, value: ERR_INVALID_TIMESTAMP };
    const paymentsForClass = this.state.paymentsByClass.get(classId) || [];
    if (paymentsForClass.some(id => this.state.payments.get(id)?.participant === this.caller)) {
      return { ok: false, value: ERR_ALREADY_PAID };
    }
    const paymentCount = this.state.paymentCountsByClass.get(classId) || 0;
    if (paymentCount >= 100) return { ok: false, value: ERR_MAX_PAYMENTS_EXCEEDED };
    const fee = Math.floor((classDetails.price * this.state.platformFeePercent) / 100);
    const netAmount = classDetails.price - fee;
    this.stxTransfers.push({ amount: fee, from: this.caller, to: this.state.feeVaultAddress });
    this.stxTransfers.push({ amount: netAmount, from: this.caller, to: classDetails.instructor });
    const paymentId = this.state.nextPaymentId;
    this.state.payments.set(paymentId, {
      classId,
      participant: this.caller,
      amount: classDetails.price,
      timestamp: this.blockHeight,
      instructor: classDetails.instructor,
      status: "paid",
      currency,
      refunded: false,
    });
    this.state.paymentsByClass.set(classId, [...paymentsForClass, paymentId]);
    this.state.paymentCountsByClass.set(classId, paymentCount + 1);
    this.state.nextPaymentId++;
    this.state.totalFeesCollected += fee;
    this.state.totalPaymentsProcessed++;
    return { ok: true, value: paymentId };
  }

  refundPayment(paymentId: number, refundAmount: number): Result<boolean> {
    const payment = this.state.payments.get(paymentId);
    if (!payment) return { ok: false, value: ERR_NO_PAYMENT_FOUND };
    if (this.caller !== payment.instructor) return { ok: false, value: ERR_ONLY_INSTRUCTOR };
    if (payment.status !== "paid") return { ok: false, value: ERR_INVALID_STATUS };
    if (refundAmount > payment.amount) return { ok: false, value: ERR_INVALID_REFUND_AMOUNT };
    if (this.state.disputes.has(paymentId)) return { ok: false, value: ERR_DISPUTE_OPEN };
    this.stxTransfers.push({ amount: refundAmount, from: payment.instructor, to: payment.participant });
    this.state.payments.set(paymentId, { ...payment, status: "refunded", refunded: true });
    return { ok: true, value: true };
  }

  fileDispute(paymentId: number, reason: string): Result<boolean> {
    const payment = this.state.payments.get(paymentId);
    if (!payment) return { ok: false, value: ERR_NO_PAYMENT_FOUND };
    if (this.caller !== payment.participant) return { ok: false, value: ERR_ONLY_PARTICIPANT };
    if (this.blockHeight - payment.timestamp >= 144) return { ok: false, value: ERR_DISPUTE_NOT_ALLOWED };
    if (reason.length === 0) return { ok: false, value: ERR_INVALID_DISPUTE_REASON };
    this.state.disputes.set(paymentId, {
      reason,
      timestamp: this.blockHeight,
      resolved: false,
      resolver: "SP000000000000000000002Q6VF78",
      outcome: "pending",
    });
    return { ok: true, value: true };
  }

  resolveDispute(paymentId: number, outcome: string, refundAmount: number): Result<boolean> {
    const dispute = this.state.disputes.get(paymentId);
    if (!dispute) return { ok: false, value: ERR_NO_DISPUTE };
    const payment = this.state.payments.get(paymentId);
    if (!payment) return { ok: false, value: ERR_NO_PAYMENT_FOUND };
    if (this.caller !== "ST1TEST") return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (dispute.resolved) return { ok: false, value: ERR_ALREADY_RESOLVED };
    if (!["refund", "no-refund"].includes(outcome)) return { ok: false, value: ERR_INVALID_OUTCOME };
    if (outcome === "refund") {
      if (refundAmount > payment.amount) return { ok: false, value: ERR_INVALID_REFUND_AMOUNT };
      this.stxTransfers.push({ amount: refundAmount, from: payment.instructor, to: payment.participant });
      this.state.payments.set(paymentId, { ...payment, status: "disputed-refunded", refunded: true });
    }
    this.state.disputes.set(paymentId, { ...dispute, resolved: true, resolver: this.caller, outcome });
    return { ok: true, value: true };
  }

  getPayment(paymentId: number): Payment | undefined {
    return this.state.payments.get(paymentId);
  }

  getDispute(paymentId: number): Dispute | undefined {
    return this.state.disputes.get(paymentId);
  }

  getPaymentsForClass(classId: number): number[] | undefined {
    return this.state.paymentsByClass.get(classId);
  }

  getPaymentCountForClass(classId: number): number {
    return this.state.paymentCountsByClass.get(classId) || 0;
  }

  getTotalFees(): Result<number> {
    return { ok: true, value: this.state.totalFeesCollected };
  }

  getTotalPayments(): Result<number> {
    return { ok: true, value: this.state.totalPaymentsProcessed };
  }

  getPlatformFeePercent(): Result<number> {
    return { ok: true, value: this.state.platformFeePercent };
  }
}

describe("PaymentProcessor", () => {
  let contract: PaymentProcessorMock;

  beforeEach(() => {
    contract = new PaymentProcessorMock();
    contract.reset();
  });

  it("sets fee vault address successfully", () => {
    const result = contract.setFeeVaultAddress("ST2NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.feeVaultAddress).toBe("ST2NEW");
  });

  it("rejects set fee vault by non-owner", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setFeeVaultAddress("ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("sets class registry address successfully", () => {
    const result = contract.setClassRegistryAddress("ST3NEW");
    expect(result.ok).toBe(true);
    expect(contract.state.classRegistryAddress).toBe("ST3NEW");
  });

  it("sets platform fee percent successfully", () => {
    const result = contract.setPlatformFeePercent(5);
    expect(result.ok).toBe(true);
    expect(contract.state.platformFeePercent).toBe(5);
  });

  it("rejects invalid platform fee percent", () => {
    const result = contract.setPlatformFeePercent(15);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_FEE_PERCENT);
  });

  it("processes payment successfully", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    const result = contract.payForClass(1, "STX");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const payment = contract.getPayment(0);
    expect(payment?.amount).toBe(1000);
    expect(payment?.status).toBe("paid");
    expect(contract.stxTransfers).toEqual([
      { amount: 20, from: "ST1TEST", to: "SP000000000000000000002Q6VF78" },
      { amount: 980, from: "ST1TEST", to: "ST4INSTR" },
    ]);
    expect(contract.getTotalFees().value).toBe(20);
    expect(contract.getTotalPayments().value).toBe(1);
  });

  it("rejects payment for inactive class", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: false, startTime: 150 });
    const result = contract.payForClass(1, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLASS_NOT_ACTIVE);
  });

  it("rejects duplicate payment", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.payForClass(1, "STX");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_PAID);
  });

  it("rejects invalid currency", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    const result = contract.payForClass(1, "USD");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CURRENCY);
  });

  it("refunds payment successfully", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.caller = "ST4INSTR";
    const result = contract.refundPayment(0, 500);
    expect(result.ok).toBe(true);
    const payment = contract.getPayment(0);
    expect(payment?.status).toBe("refunded");
    expect(payment?.refunded).toBe(true);
    expect(contract.stxTransfers).toHaveLength(3);
    expect(contract.stxTransfers[2]).toEqual({ amount: 500, from: "ST4INSTR", to: "ST1TEST" });
  });

  it("rejects refund by non-instructor", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.refundPayment(0, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ONLY_INSTRUCTOR);
  });

  it("rejects refund if dispute open", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.caller = "ST1TEST";
    contract.fileDispute(0, "bad class");
    contract.caller = "ST4INSTR";
    const result = contract.refundPayment(0, 500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_OPEN);
  });

  it("files dispute successfully", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.fileDispute(0, "class canceled");
    expect(result.ok).toBe(true);
    const dispute = contract.getDispute(0);
    expect(dispute?.reason).toBe("class canceled");
    expect(dispute?.resolved).toBe(false);
  });

  it("rejects dispute after window", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.blockHeight += 200;
    const result = contract.fileDispute(0, "late");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_DISPUTE_NOT_ALLOWED);
  });

  it("rejects empty dispute reason", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.fileDispute(0, "");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DISPUTE_REASON);
  });

  it("resolves dispute with refund", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.fileDispute(0, "issue");
    const result = contract.resolveDispute(0, "refund", 1000);
    expect(result.ok).toBe(true);
    const dispute = contract.getDispute(0);
    expect(dispute?.resolved).toBe(true);
    expect(dispute?.outcome).toBe("refund");
    const payment = contract.getPayment(0);
    expect(payment?.status).toBe("disputed-refunded");
    expect(contract.stxTransfers).toHaveLength(3);
  });

  it("resolves dispute without refund", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.fileDispute(0, "issue");
    const result = contract.resolveDispute(0, "no-refund", 0);
    expect(result.ok).toBe(true);
    const dispute = contract.getDispute(0);
    expect(dispute?.resolved).toBe(true);
    expect(dispute?.outcome).toBe("no-refund");
    expect(contract.stxTransfers).toHaveLength(2);
  });

  it("rejects resolve by non-owner", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.fileDispute(0, "issue");
    contract.caller = "ST5FAKE";
    const result = contract.resolveDispute(0, "refund", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets payment details", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const payment = contract.getPayment(0);
    expect(payment?.classId).toBe(1);
    expect(payment?.participant).toBe("ST1TEST");
  });

  it("gets dispute details", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    contract.fileDispute(0, "problem");
    const dispute = contract.getDispute(0);
    expect(dispute?.reason).toBe("problem");
  });

  it("gets payments for class", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const payments = contract.getPaymentsForClass(1);
    expect(payments).toEqual([0]);
  });

  it("gets payment count for class", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const count = contract.getPaymentCountForClass(1);
    expect(count).toBe(1);
  });

  it("gets total fees", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.getTotalFees();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(20);
  });

  it("gets total payments", () => {
    contract.classDetails.set(1, { price: 1000, instructor: "ST4INSTR", active: true, startTime: 150 });
    contract.payForClass(1, "STX");
    const result = contract.getTotalPayments();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("gets platform fee percent", () => {
    const result = contract.getPlatformFeePercent();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("uses Clarity types for parameters", () => {
    const classId = uintCV(1);
    expect(classId.value).toBe(1n);
  });
});