import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CLASS_NOT_FOUND = 101;
const ERR_INVALID_PRICE = 102;
const ERR_INVALID_DURATION = 103;
const ERR_INVALID_TITLE = 104;
const ERR_INVALID_START_TIME = 105;
const ERR_CLASS_INACTIVE = 106;
const ERR_MAX_CLASSES_EXCEEDED = 107;
const ERR_INVALID_CAPACITY = 108;
const ERR_DUPLICATE_CLASS = 109;
const ERR_UPDATE_NOT_ALLOWED = 110;
const ERR_INVALID_STATUS = 111;
const ERR_PAST_START_TIME = 112;
const ERR_NOT_INSTRUCTOR = 113;
const ERR_MAX_REGISTRATIONS = 114;

interface Class {
  title: string;
  description: string;
  instructor: string;
  price: number;
  duration: number;
  startTime: number;
  capacity: number;
  registeredCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

type Result<T> = { ok: boolean; value: T };

class ClassRegistryMock {
  state: {
    nextClassId: number;
    maxClasses: number;
    platformFeeRecipient: string;
    classes: Map<number, Class>;
    classesByInstructor: Map<string, number[]>;
    activeClassIds: number[];
  } = {
    nextClassId: 0,
    maxClasses: 1000,
    platformFeeRecipient: "SP000000000000000000002Q6VF78",
    classes: new Map(),
    classesByInstructor: new Map(),
    activeClassIds: [],
  };
  blockHeight: number = 100;
  caller: string = "ST1INSTRUCTOR";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextClassId: 0,
      maxClasses: 1000,
      platformFeeRecipient: "SP000000000000000000002Q6VF78",
      classes: new Map(),
      classesByInstructor: new Map(),
      activeClassIds: [],
    };
    this.blockHeight = 100;
    this.caller = "ST1INSTRUCTOR";
  }

  setPlatformFeeRecipient(newRecipient: string): Result<boolean> {
    if (this.caller !== "ST1INSTRUCTOR")
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.platformFeeRecipient = newRecipient;
    return { ok: true, value: true };
  }

  createClass(
    title: string,
    description: string,
    price: number,
    duration: number,
    startTime: number,
    capacity: number
  ): Result<number> {
    if (this.state.nextClassId >= this.state.maxClasses)
      return { ok: false, value: ERR_MAX_CLASSES_EXCEEDED };
    if (!title || title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (startTime < this.blockHeight)
      return { ok: false, value: ERR_INVALID_START_TIME };
    if (capacity <= 0 || capacity > 500)
      return { ok: false, value: ERR_INVALID_CAPACITY };
    const classId = this.state.nextClassId;
    const newClass: Class = {
      title,
      description,
      instructor: this.caller,
      price,
      duration,
      startTime,
      capacity,
      registeredCount: 0,
      active: true,
      createdAt: this.blockHeight,
      updatedAt: this.blockHeight,
    };
    this.state.classes.set(classId, newClass);
    const instructorClasses =
      this.state.classesByInstructor.get(this.caller) || [];
    if (instructorClasses.length >= 200)
      return { ok: false, value: ERR_MAX_REGISTRATIONS };
    this.state.classesByInstructor.set(this.caller, [
      ...instructorClasses,
      classId,
    ]);
    if (this.state.activeClassIds.length >= 1000)
      return { ok: false, value: ERR_MAX_CLASSES_EXCEEDED };
    this.state.activeClassIds.push(classId);
    this.state.nextClassId++;
    return { ok: true, value: classId };
  }

  getClass(classId: number): Class | undefined {
    return this.state.classes.get(classId);
  }

  getClassesByInstructor(instructor: string): number[] {
    return this.state.classesByInstructor.get(instructor) || [];
  }

  getActiveClassIds(): number[] {
    return this.state.activeClassIds;
  }

  getNextClassId(): Result<number> {
    return { ok: true, value: this.state.nextClassId };
  }

  getTotalClasses(): Result<number> {
    return { ok: true, value: this.state.nextClassId };
  }

  updateClass(
    classId: number,
    title: string,
    description: string,
    price: number,
    duration: number,
    capacity: number
  ): Result<boolean> {
    const cls = this.state.classes.get(classId);
    if (!cls) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (cls.instructor !== this.caller)
      return { ok: false, value: ERR_NOT_INSTRUCTOR };
    if (!cls.active) return { ok: false, value: ERR_CLASS_INACTIVE };
    if (cls.startTime < this.blockHeight)
      return { ok: false, value: ERR_PAST_START_TIME };
    if (!title || title.length === 0 || title.length > 100)
      return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500)
      return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (price <= 0) return { ok: false, value: ERR_INVALID_PRICE };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (capacity <= 0 || capacity > 500)
      return { ok: false, value: ERR_INVALID_CAPACITY };
    const updated: Class = {
      ...cls,
      title,
      description,
      price,
      duration,
      capacity,
      updatedAt: this.blockHeight,
    };
    this.state.classes.set(classId, updated);
    return { ok: true, value: true };
  }

  cancelClass(classId: number): Result<boolean> {
    const cls = this.state.classes.get(classId);
    if (!cls) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (cls.instructor !== this.caller)
      return { ok: false, value: ERR_NOT_INSTRUCTOR };
    if (!cls.active) return { ok: false, value: ERR_INVALID_STATUS };
    this.state.classes.set(classId, {
      ...cls,
      active: false,
      updatedAt: this.blockHeight,
    });
    this.state.activeClassIds = this.state.activeClassIds.filter(
      (id) => id !== classId
    );
    return { ok: true, value: true };
  }

  incrementRegisteredCount(classId: number): Result<boolean> {
    const cls = this.state.classes.get(classId);
    if (!cls) return { ok: false, value: ERR_CLASS_NOT_FOUND };
    if (!cls.active) return { ok: false, value: ERR_CLASS_INACTIVE };
    if (cls.registeredCount >= cls.capacity)
      return { ok: false, value: ERR_MAX_REGISTRATIONS };
    this.state.classes.set(classId, {
      ...cls,
      registeredCount: cls.registeredCount + 1,
    });
    return { ok: true, value: true };
  }
}

describe("ClassRegistry", () => {
  let contract: ClassRegistryMock;

  beforeEach(() => {
    contract = new ClassRegistryMock();
    contract.reset();
  });

  it("creates class successfully", () => {
    const result = contract.createClass(
      "Morning Yoga",
      "30 min session",
      500,
      30,
      150,
      20
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const cls = contract.getClass(0);
    expect(cls?.title).toBe("Morning Yoga");
    expect(cls?.price).toBe(500);
    expect(cls?.capacity).toBe(20);
    expect(contract.getActiveClassIds()).toEqual([0]);
  });

  it("rejects invalid title", () => {
    const result = contract.createClass("", "desc", 500, 30, 150, 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects past start time", () => {
    const result = contract.createClass("Yoga", "desc", 500, 30, 50, 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_START_TIME);
  });

  it("rejects zero price", () => {
    const result = contract.createClass("Yoga", "desc", 0, 30, 150, 20);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PRICE);
  });

  it("rejects capacity over 500", () => {
    const result = contract.createClass("Yoga", "desc", 500, 30, 150, 501);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CAPACITY);
  });

  it("updates class successfully", () => {
    contract.createClass("Old", "desc", 500, 30, 150, 20);
    const result = contract.updateClass(0, "New Yoga", "updated", 600, 45, 25);
    expect(result.ok).toBe(true);
    const cls = contract.getClass(0);
    expect(cls?.title).toBe("New Yoga");
    expect(cls?.price).toBe(600);
    expect(cls?.updatedAt).toBe(contract.blockHeight);
  });

  it("rejects update by non-instructor", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 20);
    contract.caller = "ST2OTHER";
    const result = contract.updateClass(0, "New", "desc", 600, 45, 25);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_INSTRUCTOR);
  });

  it("rejects update after start time", () => {
    contract.createClass("Yoga", "desc", 500, 30, 105, 20);
    contract.blockHeight = 110;
    const result = contract.updateClass(0, "New", "desc", 600, 45, 25);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAST_START_TIME);
  });

  it("cancels class successfully", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 20);
    const result = contract.cancelClass(0);
    expect(result.ok).toBe(true);
    const cls = contract.getClass(0);
    expect(cls?.active).toBe(false);
    expect(contract.getActiveClassIds()).toEqual([]);
  });

  it("rejects cancel by non-instructor", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 20);
    contract.caller = "ST2OTHER";
    const result = contract.cancelClass(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_INSTRUCTOR);
  });

  it("increments registered count", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 3);
    contract.incrementRegisteredCount(0);
    contract.incrementRegisteredCount(0);
    const result = contract.incrementRegisteredCount(0);
    expect(result.ok).toBe(true);
    const cls = contract.getClass(0);
    expect(cls?.registeredCount).toBe(3);
  });

  it("rejects increment beyond capacity", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 1);
    contract.incrementRegisteredCount(0);
    const result = contract.incrementRegisteredCount(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_REGISTRATIONS);
  });

  it("gets classes by instructor", () => {
    contract.createClass("Yoga", "desc", 500, 30, 150, 20);
    contract.createClass("HIIT", "desc", 600, 45, 160, 15);
    const ids = contract.getClassesByInstructor("ST1INSTRUCTOR");
    expect(ids).toEqual([0, 1]);
  });

  it("gets total classes", () => {
    contract.createClass("A", "d", 100, 10, 150, 10);
    contract.createClass("B", "d", 200, 20, 160, 15);
    const result = contract.getTotalClasses();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("enforces max classes", () => {
    contract.state.maxClasses = 1;
    contract.createClass("A", "d", 100, 10, 150, 10);
    const result = contract.createClass("B", "d", 200, 20, 160, 15);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CLASSES_EXCEEDED);
  });
});
