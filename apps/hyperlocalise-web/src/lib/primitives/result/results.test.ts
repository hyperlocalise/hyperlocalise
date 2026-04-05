import { describe, expect, it } from "vitest";

import { err, fromThrowable, fromThrowableAsync, isErr, isOk, ok, okOr, okOrElse } from "./results";

describe("Result", () => {
  describe("ok", () => {
    it("should create an Ok result", () => {
      const result = ok<number, string>(42);
      expect(result.ok).toBe(true);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it("should map Ok values", () => {
      const result = ok<number, string>(42);
      const mapped = result.map((x) => x * 2);
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(84);
      }
    });

    it("should not transform on mapErr", () => {
      const result = ok<number, string>(42);
      const mapped = result.mapErr((e) => e.length);
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(42);
      }
    });
  });

  describe("err", () => {
    it("should create an Err result", () => {
      const result = err<number, string>("error");
      expect(result.ok).toBe(false);
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe("error");
      }
    });

    it("should not transform on map", () => {
      const result = err<number, string>("error");
      const mapped = result.map((x) => x * 2);
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe("error");
      }
    });

    it("should map Err values", () => {
      const result = err<number, string>("error");
      const mapped = result.mapErr((e) => e.length);
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(5);
      }
    });
  });

  describe("okOr", () => {
    it("should return value when promise resolves", async () => {
      const promise = Promise.resolve(42);
      const result = await okOr(promise, undefined);
      expect(result).toBe(42);
    });

    it("should return fallback when promise rejects", async () => {
      const promise = Promise.reject(new Error("fail"));
      const result = await okOr(promise, 42);
      expect(result).toBe(42);
    });
  });

  describe("okOrElse", () => {
    it("should return value when promise resolves", async () => {
      const promise = Promise.resolve(42);
      const result = await okOrElse(promise, () => 0);
      expect(result).toBe(42);
    });

    it("should return fallback function result when promise rejects", async () => {
      const promise = Promise.reject(new Error("fail"));
      const result = await okOrElse(promise, () => 42);
      expect(result).toBe(42);
    });
  });

  describe("fromThrowableAsync", () => {
    it("should return Ok when promise resolves", async () => {
      const inputPromise = Promise.resolve(42);

      const actualResult = await fromThrowableAsync(inputPromise);

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe(42);
      }
    });

    it("should return Err when promise rejects", async () => {
      const expectedError = new Error("Promise failed");
      const inputPromise = Promise.reject(expectedError);

      const actualResult = await fromThrowableAsync(inputPromise);

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect(actualResult.error).toBe(expectedError);
      }
    });

    it("should handle promise that rejects with string error", async () => {
      const expectedError = "String error";
      const inputPromise = Promise.reject(new Error(expectedError));

      const actualResult = await fromThrowableAsync(inputPromise);

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect((actualResult.error as Error).message).toBe(expectedError);
      }
    });

    it("should handle promise that rejects with null", async () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      const inputPromise = Promise.reject(null);

      const actualResult = await fromThrowableAsync(inputPromise);

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect(actualResult.error).toBe(null);
      }
    });

    it("should handle promise that resolves with undefined", async () => {
      const inputPromise = Promise.resolve(undefined);

      const actualResult = await fromThrowableAsync(inputPromise);

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe(undefined);
      }
    });
  });

  describe("fromThrowable", () => {
    it("should return Ok when function executes successfully", () => {
      const inputFunction = (x: number) => x * 2;
      const inputValue = 21;

      const wrappedFunction = fromThrowable(inputFunction);
      const actualResult = wrappedFunction(inputValue);

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe(42);
      }
    });

    it("should return Err when function throws", () => {
      const expectedError = new Error("Function failed");
      const inputFunction = () => {
        throw expectedError;
      };

      const wrappedFunction = fromThrowable(inputFunction);
      const actualResult = wrappedFunction();

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect(actualResult.error).toBe(expectedError);
      }
    });

    it("should handle function that throws string error", () => {
      const expectedError = "String error";
      const inputFunction = () => {
        throw new Error(expectedError);
      };

      const wrappedFunction = fromThrowable(inputFunction);
      const actualResult = wrappedFunction();

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect((actualResult.error as Error).message).toBe(expectedError);
      }
    });

    it("should handle function with multiple parameters", () => {
      const inputFunction = (a: number, b: number, c: string) =>
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        `${a + b}: ${c}`;
      const inputA = 10;
      const inputB = 20;
      const inputC = "result";

      const wrappedFunction = fromThrowable(inputFunction);
      const actualResult = wrappedFunction(inputA, inputB, inputC);

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe("30: result");
      }
    });

    it("should handle function that returns undefined", () => {
      const inputFunction = () => undefined;

      const wrappedFunction = fromThrowable(inputFunction);
      const actualResult = wrappedFunction();

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe(undefined);
      }
    });

    it("should apply errorFn when provided and function throws", () => {
      const originalError = new Error("Original error");
      const transformedError = "Transformed error";
      const inputFunction = () => {
        throw originalError;
      };

      const errorFunction = (_e: unknown) => transformedError;

      const wrappedFunction = fromThrowable(inputFunction, errorFunction);
      const actualResult = wrappedFunction();

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect(actualResult.error).toBe(transformedError);
      }
    });

    it("should not apply errorFn when function succeeds", () => {
      const inputFunction = () => 42;

      const errorFunction = (_e: unknown) => "This should not be called";

      const wrappedFunction = fromThrowable(inputFunction, errorFunction);
      const actualResult = wrappedFunction();

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe(42);
      }
    });

    it("should handle errorFn that transforms error object to string", () => {
      const originalError = new Error("Original message");
      const inputFunction = () => {
        throw originalError;
      };
      const errorFunction = (e: unknown) => (e as Error).message;

      const wrappedFunction = fromThrowable(inputFunction, errorFunction);
      const actualResult = wrappedFunction();

      expect(isErr(actualResult)).toBe(true);
      if (isErr(actualResult)) {
        expect(actualResult.error).toBe("Original message");
      }
    });

    it("should preserve function signature with correct typing", () => {
      const inputFunction = (name: string, age: number): string =>
        `${name} is ${age.toString()} years old`;

      const wrappedFunction = fromThrowable(inputFunction);
      // TypeScript should infer the correct parameter types
      const actualResult = wrappedFunction("Alice", 30);

      expect(isOk(actualResult)).toBe(true);
      if (isOk(actualResult)) {
        expect(actualResult.value).toBe("Alice is 30 years old");
      }
    });
  });
});
