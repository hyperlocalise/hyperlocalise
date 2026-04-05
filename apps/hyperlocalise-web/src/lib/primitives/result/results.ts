interface ResultInterface<T, E> {
  readonly ok: boolean;

  map<U>(fn: (value: T) => U): Result<U, E>;

  mapErr<F>(fn: (err: E) => F): Result<T, F>;
}

class OkImpl<T> implements ResultInterface<T, never> {
  constructor(readonly value: T) {}

  readonly ok = true;

  map<U>(fn: (value: T) => U) {
    return new OkImpl(fn(this.value));
  }

  mapErr() {
    return this;
  }
}

export class ErrImpl<E> implements ResultInterface<never, E> {
  constructor(readonly error: E) {}

  readonly ok = false;

  map() {
    return this;
  }

  mapErr<F>(fn: (err: E) => F) {
    return new ErrImpl(fn(this.error));
  }
}

export type Ok<T> = OkImpl<T>;
export type Err<E> = ErrImpl<E>;

export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T, E>(value: T): Result<T, E> {
  return new OkImpl(value);
}

export function err<T, E>(error: E): Result<T, E> {
  return new ErrImpl(error);
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function okOr<T>(promise: Promise<T>, fallback: T | undefined): Promise<T | undefined> {
  return promise.then(
    (value) => value,
    () => fallback,
  );
}

export function okOrElse<T>(promise: Promise<T>, fn: () => T): Promise<T> {
  return promise.then((value) => value, fn);
}

/**
 * Wraps a promise with a try catch, creating a new promise with the same
 * arguments but returning `Ok` if successful, `Err` if the promise throws
 *
 * @param promise promise to wrap with ok on success or err on failure
 */
export async function fromThrowableAsync<T>(promise: Promise<T>): Promise<Result<T, unknown>> {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    return err(error);
  }
}

/**
 * Wraps a function with a try catch, creating a new function with the same
 * arguments but returning `Ok` if successful, `Err` if the function throws
 *
 * @param fn function to wrap with ok on success or err on failure
 * @param errorFn when an error is thrown, this will wrap the error result if provided
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromThrowable<Fn extends (...args: readonly any[]) => any>(
  fn: Fn,
  errorFn?: (e: unknown) => unknown,
): (...args: Parameters<Fn>) => Result<ReturnType<Fn>, unknown> {
  return (...args) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = fn(...args);
      return ok(result);
    } catch (e) {
      return err(errorFn ? errorFn(e) : e);
    }
  };
}
