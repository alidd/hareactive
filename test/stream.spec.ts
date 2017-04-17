import { assert } from "chai";
import { spy, useFakeTimers } from "sinon";

import { map } from "../src/index";
import { placeholder } from "../src/placeholder";
import * as S from "../src/stream";
import {
  Stream, keepWhen, apply, filterApply, snapshot, snapshotWith, split,
  throttle, delay
} from "../src/stream";
import * as B from "../src/behavior";
import { Behavior, at } from "../src/behavior";

const addTwo = (v: number): number => v + 2;
const sum = (a: number, b: number): number => a + b;

function publish<A>(a: A, stream: Stream<A>): void {
  stream.push(a);
}

describe("Stream", () => {
  describe("apply", () => {
    it("at applies function in behavior", () => {
      const fnB = B.sink((n: number) => n * n);
      const origin = S.empty<number>();
      const applied = apply(fnB, origin);
      const callback = spy();
      S.subscribe(callback, applied);
      publish(2, origin);
      publish(3, origin);
      fnB.push((n: number) => 2 * n)
      publish(4, origin);
      publish(5, origin);
      fnB.push((n: number) => n / 2);
      publish(4, origin);
      fnB.push(Math.sqrt);
      publish(25, origin);
      publish(36, origin);
      assert.deepEqual(callback.args, [
        [4], [9], [8], [10], [2], [5], [6]
      ]);
    });
  });
  describe("filter", () => {
    it("should be a function", () => {
      assert.isFunction(S.filter);
    });

    it("should filter the unwanted publishions", () => {
      const obs = S.empty();
      const callback = spy();

      const isEven = (v: number): boolean => !(v % 2);

      const filteredObs = S.filter(isEven, obs);

      S.subscribe(callback, filteredObs);

      for (let i = 0; i < 10; i++) {
        publish(i, obs);
      }
      assert.deepEqual(callback.args, [[0], [2], [4], [6], [8]], "Wrong or no value was recieved");
    });
  });
  describe("split", () => {
    it("splits based on predicate", () => {
      const sink = S.empty<number>();
      const callbackA = spy();
      const callbackB = spy();
      const [a, b] = split((n) => n % 2 === 0, sink);
      a.subscribe(callbackA);
      b.subscribe(callbackB);
      sink.push(1);
      sink.push(4);
      sink.push(7);
      sink.push(10);
      assert.deepEqual(callbackA.args, [[4], [10]]);
      assert.deepEqual(callbackB.args, [[1], [7]]);
    });
  });
  describe("filterApply", () => {
    it("at applies filter from behavior", () => {
      const predB = B.sink((n: number) => n % 2 === 0);
      const origin = S.empty<number>();
      const filtered = filterApply(predB, origin);
      const callback = spy();
      S.subscribe(callback, filtered);
      publish(2, origin);
      publish(3, origin);
      predB.push((n: number) => n % 3 === 0);
      publish(4, origin);
      publish(6, origin);
      predB.push((n: number) => n % 4 === 0);
      publish(6, origin);
      publish(12, origin);
      assert.deepEqual(callback.args, [
        [2], [6], [12]
      ]);
    });
  });

  describe("scanS", () => {
    it("should scan the values to a stream", () => {
      const eventS = S.empty();
      const callback = spy();
      const sumF = (currSum: number, val: number) => currSum + val;
      const currentSumE = at(S.scanS(sumF, 0, eventS));
      S.subscribe(callback, currentSumE);
      for (let i = 0; i < 10; i++) {
        publish(i, eventS);
      }
      assert.deepEqual(callback.args, [[0], [1], [3], [6], [10], [15], [21], [28], [36], [45]]);
    });
  });

  describe("keepWhen", () => {
    it("removes occurences when behavior is false", () => {
      let flag = true;
      const bool: Behavior<boolean> = B.fromFunction(() => flag);
      const origin = S.empty<number>();
      const filtered = keepWhen(origin, bool);
      const callback = spy();
      S.subscribe(callback, filtered);
      publish(0, origin);
      publish(1, origin);
      flag = false;
      publish(2, origin);
      publish(3, origin);
      flag = true;
      publish(4, origin);
      flag = false;
      publish(5, origin);
      flag = true;
      publish(6, origin);
      assert.deepEqual(callback.args, [
        [0], [1], [4], [6]
      ]);
    });
  });

  describe("snapshot", () => {
    it("snapshots pull based Behavior", () => {
      let n = 0;
      const b: Behavior<number> = B.fromFunction(() => n);
      const e: Stream<number> = S.empty<number>();
      const shot = snapshot<number>(b, e);
      const callback = spy();
      S.subscribe(callback, shot);
      publish(0, e);
      publish(1, e);
      n = 1;
      publish(2, e);
      n = 2;
      publish(3, e);
      publish(4, e);
      assert.deepEqual(callback.args, [
        [0], [0], [1], [2], [2]
      ]);
    });
    it("applies function in snapshotWith to pull based Behavior", () => {
      let n = 0;
      const b: Behavior<number> = B.fromFunction(() => n);
      const e: Stream<number> = S.empty<number>();
      const shot = snapshotWith<number, number, number>(sum, b, e);
      const callback = spy();
      S.subscribe(callback, shot);
      publish(0, e);
      publish(1, e);
      n = 1;
      publish(2, e);
      n = 2;
      publish(3, e);
      publish(4, e);
      assert.deepEqual(callback.args, [
        [0], [1], [3], [5], [6]
      ]);
    });
    it("works with placeholder", () => {
      let result = 0;
      const b = Behavior.of(7);
      const p = placeholder();
      const snap = snapshot(b, p);
      snap.subscribe((n: number) => result = n);
      const s = S.empty();
      p.replaceWith(s);
      assert.strictEqual(result, 0);
      s.push(1);
      assert.strictEqual(result, 7);
    });
  });
  describe("timing operators", () => {
    let clock: any;
    beforeEach(() => {
      clock = useFakeTimers();
    });
    afterEach(() => {
      clock.restore();
    });
    describe("delay", () => {
      it("should delay every push", () => {
        let n = 0;
        const s = S.empty<number>();
        const delayedS = delay(50, s);
        delayedS.subscribe(() => n = 2);
        s.subscribe(() => n = 1);
        s.push(0);
        assert.strictEqual(n, 1);
        clock.tick(49);
        assert.strictEqual(n, 1);
        clock.tick(1);
        assert.strictEqual(n, 2)
      });
      it("should work with placeholder", () => {
        let n = 0;
        const p = placeholder();
        const delayedP = delay(50, p);
        delayedP.subscribe(() => n = 2);
        p.subscribe(() => n = 1);
        const s = S.empty<number>();
        p.replaceWith(s);
        s.push(0);
        assert.strictEqual(n, 1);
        clock.tick(49);
        assert.strictEqual(n, 1);
        clock.tick(1);
        assert.strictEqual(n, 2)
      });
    });
    describe("throttle", () => {
      it("after an occurrence it should ignore", () => {
        let n = 0;
        const s = S.empty<number>();
        const throttleS = throttle(100, s);
        throttleS.subscribe((v) => n = v);
        assert.strictEqual(n, 0);
        s.push(1);
        assert.strictEqual(n, 1);
        clock.tick(80);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(19);
        s.push(3);
        assert.strictEqual(n, 1);
        clock.tick(1);
        s.push(4);
        assert.strictEqual(n, 4);
      });
      it("should work with placeholder", () => {
        let n = 0;
        const p = placeholder();
        const throttleP = throttle(100, p);
        throttleP.subscribe((v: number) => n = v);
        assert.strictEqual(n, 0);
        const s = S.empty<number>();
        p.replaceWith(s);
        s.push(1);
        clock.tick(99);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(1);
        s.push(3);
        assert.strictEqual(n, 3);
      });
    });

    describe("debounce", () => {
      it("holding the latest occurens until an amount of time has passed", () => {
        let n = 0;
        const s = S.empty<number>();
        const debouncedS = S.debounce(100, s);
        debouncedS.subscribe((v) => n = v);
        assert.strictEqual(n, 0);
        s.push(1);
        clock.tick(80);
        assert.strictEqual(n, 0);
        clock.tick(30);
        assert.strictEqual(n, 1);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(99);
        assert.strictEqual(n, 1);
        clock.tick(2);
        assert.strictEqual(n, 2);
      });
      it("should work with placeholder", () => {
        let n = 0;
        const p = placeholder();
        const debouncedP = S.debounce(100, p);
        debouncedP.subscribe((v: number) => n = v);
        const s = S.empty<number>();
        p.replaceWith(s);
        assert.strictEqual(n, 0);
        s.push(1);
        clock.tick(80);
        assert.strictEqual(n, 0);
        clock.tick(30);
        assert.strictEqual(n, 1);
        s.push(2);
        assert.strictEqual(n, 1);
        clock.tick(99);
        assert.strictEqual(n, 1);
        clock.tick(2);
        assert.strictEqual(n, 2);
      });
    });
  });
});
