export interface Left<E> {
  readonly _tag: "Left";
  readonly left: E;
}

export interface Right<A> {
  readonly _tag: "Right";
  readonly right: A;
}

export type Either<L, R> = Left<L> | Right<R>;

const either = {
  left: <L, R>(left: L): Either<L, R> => ({ _tag: "Left", left }),
  right: <L, R>(right: R): Either<L, R> => ({ _tag: "Right", right }),
  isLeft: <L, R>(value: Either<L, R>): value is Left<L> => value._tag === "Left",
  isRight: <L, R>(value: Either<L, R>): value is Either<L, R> => value._tag === "Right",
};

export default either;
