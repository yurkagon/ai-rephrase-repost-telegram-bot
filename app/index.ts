require("dotenv").config();
require("./app");

class CustomPromise<T = any> {
  status: "pending" | "fulfilled" | "rejected" = "pending";
  value: T;

  callback;
  callbackError;

  constructor(executer: (res: (t: T) => void, rej: (t: any) => void) => void) {
    executer(this.resolve, this.reject);
  }

  public then = (cb) => {
    const promise = new CustomPromise((res, rej) => {
      this.callback = (t) => {
        try {
          const result = cb(t);

          res(result)
        } catch (e) {
         rej(e);
        }
      };
    });

    return promise;
  };

  public catch = (cb) => {
    const promise = new CustomPromise((res, rej) => {
      this.callbackError = (t) => {
        try {
          const result = cb(t);

          res(result)
        } catch (e) {
         rej(e);
        }
      };
    });

    return promise;
  };

  private resolve = (t: T) => {
    this.status = "fulfilled";
    this.value = t;

    // Simulate microtask
    setTimeout(() =>  this.callback && this.callback(t), 0);
  };

  private reject = (t: any) => {
    this.status = "rejected";
    this.value = t;

    // Simulate microtask
    setTimeout(() =>  this.callbackError && this.callbackError(t), 0);
  };
}

// new CustomPromise((res, rej) => {
//   setTimeout(() => res("KEK"), 10);
// }).then((value) => {
//   console.log(value);

//   return "What?";
// }).then((value) => {
//   console.log("FINAL", value)

//   throw new Error("error");
// }).catch((e) => {
//   console.log("ERROR", e)
// });


(async () =>  {
  try {

    // @ts-ignore
    await new CustomPromise((res, rej) => rej("lol"));
  } catch (e) {
    console.log("ERROR", e)
  }
})();
