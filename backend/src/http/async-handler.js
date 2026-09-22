"use strict";

// 全局错误中间件识别的受控错误：message 作为 error 字段，extra 合并进响应体。
class ApiError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.extra = extra || {};
  }
}

// 把 async 处理器的 rejected Promise 交给 Express 错误中间件。
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { ApiError, asyncHandler };
