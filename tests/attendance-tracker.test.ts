import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CLASS_NOT_FOUND = 101;
const ERR_PARTICIPANT_NOT_FOUND = 102;
const ERR_ALREADY_CHECKED_IN = 103;
const ERR_CHECKIN_WINDOW_CLOSED = 104;
const ERR_INVALID_CLASS_ID = 105;
const ERR_INVALID_PARTICIPANT = 106;
const ERR_MAX_ATTENDANCE_EXCEEDED = 107;
const ERR_CHECKOUT_NOT_ALLOWED = 108;
const ERR_NOT_INSTRUCTOR = 109;

interface Attendance {
  classId: number;
  participant: string;
  checkinTime: number;
  checkoutTime: number | null;
  status: string;
}

interface Class {
  startTime: number;
  instructor: string;
}

type Result<T> = { ok: boolean; value: T };

class AttendanceTrackerMock {
  state: {
    classRegistryAddress: string;
    paymentProcessorAddress: string;
    nextAttendanceId: number;
    attendance: Map<number, Attendance>;
    attendanceByClass: Map<number, number[]>;
    attendanceByParticipant: Map<string, number>;
    classAttendanceCount: Map<number, number>;
    classes: Map<number, Class>;
  } = {
    classRegistryAddress: "SP000000000000000000002Q6VF78",
    paymentProcessorAddress: "SP000000000000000000002Q6VF78",
    nextAttendanceId: 0,
    attendance: new Map(),
    attendanceByClass: new Map(),
    attendanceByParticipant: new Map(),
    classAttendanceCount: new Map(),
    classes: new Map(),
  };
  blockHeight: number = 150;
  caller: string = "ST1PARTICIPANT";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      classRegistryAddress: "SP000000000000000000002Q6VF78",
      paymentProcessorAddress: "SP000000000000000000002Q6VF78",
      nextAttendanceId: 0,
      attendance: new Map(),
      attendanceByClass: new Map(),
      attendanceByParticipant: new Map(),
      classAttendanceCount: new Map(),
      classes: new Map(),
    };
    this.blockHeight = 150;
    this.caller = "ST1PARTICIPANT";
  }

  setClassRegistryAddress(addr: string): Result<boolean> {
    if (this.caller !== "ST1OWNER")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.classRegistryAddress = addr;
    return { ok: true, value: true };
  }

  setPaymentProcessorAddress(addr: string): Result<boolean> {
    if (this.caller !== "ST1OWNER")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paymentProcessorAddress = addr;
    return { ok: true, valueарда: true };
  }

  getClass(classId: number): Result<Class> {
    const cls = this.state.classes.get(classId);
    return cls
      ? { ok: true, value: cls }
      : { ok: false, value: ERR_CLASS_NOT_FOUND };
  }

  checkin(classId: number): Result<number> {
    const classRes = this.getClass(classId);
    if (!classRes.ok) return { ok: false, value: classRes.value };
    const cls = classRes.value;
    if (
      this.blockHeight < cls.startTime ||
      this.blockHeight > cls.startTime + 30
    )
      return { ok: false, value: ERR_CHECKIN_WINDOW_CLOSED };
    const key = `${this.caller}-${classId}`;
    if (this.state.attendanceByParticipant.has(key))
      return { ok: false, value: ERR_ALREADY_CHECKED_IN };
    const count = this.state.classAttendanceCount.get(classId) || 0;
    if (count >= 500) return { ok: false, value: ERR_MAX_ATTENDANCE_EXCEEDED };
    const id = this.state.nextAttendanceId++;
    this.state.attendance.set(id, {
      classId,
      participant: this.caller,
      checkinTime: this.blockHeight,
      checkoutTime: null,
      status: "checked-in",
    });
    this.state.attendanceByClass.set(classId, [
      ...(this.state.attendanceByClass.get(classId) || []),
      id,
    ]);
    this.state.attendanceByParticipant.set(key, id);
    this.state.classAttendanceCount.set(classId, count + 1);
    return { ok: true, value: id };
  }

  checkout(attendanceId: number): Result<boolean> {
    const record = this.state.attendance.get(attendanceId);
    if (!record) return { ok: false, value: ERR_PARTICIPANT_NOT_FOUND };
    if (record.participant !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (record.status !== "checked-in")
      return { ok: false, value: ERR_CHECKOUT_NOT_ALLOWED };
    this.state.attendance.set(attendanceId, {
      ...record,
      checkoutTime: this.blockHeight,
      status: "completed",
    });
    return { ok: true, value: true };
  }

  markNoShow(attendanceId: number): Result<boolean> {
    const record = this.state.attendance.get(attendanceId);
    const cls = record ? this.state.classes.get(record.classId) : null;
    if (!record || !cls) return { ok: false, value: ERR_PARTICIPANT_NOT_FOUND };
    if (this.caller !== cls.instructor)
      return { ok: false, value: ERR_NOT_INSTRUCTOR };
    if (record.status !== "checked-in")
      return { ok: false, value: ERR_CHECKOUT_NOT_ALLOWED };
    this.state.attendance.set(attendanceId, { ...record, status: "no-show" });
    return { ok: true, value: true };
  }

  getAttendance(id: number): Attendance | undefined {
    return this.state.attendance.get(id);
  }

  getAttendanceByParticipant(
    participant: string,
    classId: number
  ): number | undefined {
    return this.state.attendanceByParticipant.get(`${participant}-${classId}`);
  }

  getAttendanceForClass(classId: number): number[] {
    return this.state.attendanceByClass.get(classId) || [];
  }

  getClassAttendanceCount(classId: number): number {
    return this.state.classAttendanceCount.get(classId) || 0;
  }

  hasCheckedIn(participant: string, classId: number): boolean {
    return this.state.attendanceByParticipant.has(`${participant}-${classId}`);
  }
}

describe("AttendanceTracker", () => {
  let contract: AttendanceTrackerMock;

  beforeEach(() => {
    contract = new AttendanceTrackerMock();
    contract.reset();
    contract.caller = "ST1OWNER";
    contract.setClassRegistryAddress("ST2REG");
    contract.setPaymentProcessorAddress("ST3PAY");
    contract.state.classes.set(1, { startTime: 150, instructor: "ST4INSTR" });
  });

  it("checks in successfully during window", () => {
    contract.caller = "ST1PARTICIPANT";
    const result = contract.checkin(1);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const record = contract.getAttendance(0);
    expect(record?.status).toBe("checked-in");
    expect(contract.getClassAttendanceCount(1)).toBe(1);
  });

  it("rejects checkin outside 30-block window", () => {
    contract.blockHeight = 190;
    contract.caller = "ST1PARTICIPANT";
    const result = contract.checkin(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHECKIN_WINDOW_CLOSED);
  });

  it("rejects duplicate checkin", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    const result = contract.checkin(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_CHECKED_IN);
  });

  it("rejects checkin when class not found", () => {
    contract.caller = "ST1PARTICIPANT";
    const result = contract.checkin(99);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CLASS_NOT_FOUND);
  });

  it("enforces max 500 attendance per class", () => {
    contract.caller = "ST1PARTICIPANT";
    for (let i = 0; i < 500; i++) {
      contract.caller = `ST${i}USER`;
      contract.checkin(1);
    }
    contract.caller = "ST500USER";
    const result = contract.checkin(1);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ATTENDANCE_EXCEEDED);
  });

  it("allows checkout by participant", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    const result = contract.checkout(0);
    expect(result.ok).toBe(true);
    const record = contract.getAttendance(0);
    expect(record?.status).toBe("completed");
    expect(record?.checkoutTime).toBe(contract.blockHeight);
  });

  it("rejects checkout by wrong user", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    contract.caller = "ST2HACKER";
    const result = contract.checkout(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("allows instructor to mark no-show", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    contract.caller = "ST4INSTR";
    const result = contract.markNoShow(0);
    expect(result.ok).toBe(true);
    const record = contract.getAttendance(0);
    expect(record?.status).toBe("no-show");
  });

  it("rejects no-show by non-instructor", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    contract.caller = "ST5FAKE";
    const result = contract.markNoShow(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_INSTRUCTOR);
  });

  it("tracks attendance by class", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    contract.caller = "ST2PARTICIPANT";
    contract.checkin(1);
    const ids = contract.getAttendanceForClass(1);
    expect(ids).toEqual([0, 1]);
  });

  it("tracks attendance by participant", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    const id = contract.getAttendanceByParticipant("ST1PARTICIPANT", 1);
    expect(id).toBe(0);
  });

  it("returns correct attendance count", () => {
    contract.caller = "ST1PARTICIPANT";
    contract.checkin(1);
    contract.caller = "ST2PARTICIPANT";
    contract.checkin(1);
    expect(contract.getClassAttendanceCount(1)).toBe(2);
  });
});
