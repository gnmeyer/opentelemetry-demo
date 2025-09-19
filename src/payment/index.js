// Copyright The OpenTelemetry Authors
// SPDX-License-Identifier: Apache-2.0
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')
const health = require('grpc-js-health-check')
const opentelemetry = require('@opentelemetry/api')

const charge = require('./charge')
const logger = require('./logger')

async function chargeServiceHandler(call, callback) {
  const span = opentelemetry.trace.getActiveSpan();

  try {
    const amount = call.request.amount
    span?.setAttributes({
      'app.payment.amount': parseFloat(`${amount.units}.${amount.nanos}`).toFixed(2)
    })
    logger.info({ request: call.request }, "Charge request received.")

    const response = await charge.charge(call.request)
    callback(null, response)

  } catch (err) {
    logger.warn({ err })

    span?.recordException(err)
    span?.setStatus({ code: opentelemetry.SpanStatusCode.ERROR })
    callback(err)
  }
}

async function closeGracefully(signal) {
  server.forceShutdown()
  process.kill(process.pid, signal)
}

const otelDemoPackage = grpc.loadPackageDefinition(protoLoader.loadSync('demo.proto'))
const server = new grpc.Server()

server.addService(health.service, new health.Implementation({
  '': health.servingStatus.SERVING
}))

server.addService(otelDemoPackage.oteldemo.PaymentService.service, { charge: chargeServiceHandler })

const ipv6Addr = process.env.IPV6_ADDR;
let address;

if (ipv6Addr) {
  address = `${ipv6Addr}:${process.env['PAYMENT_PORT']}`;
  console.log(`IPv6 ENABLED - binding to ${address}`);
} else {
  address = `0.0.0.0:${process.env['PAYMENT_PORT']}`;
}

server.bindAsync(address, grpc.ServerCredentials.createInsecure(), (err, port) => {
  if (err) {
    return logger.error({ err })
  }

  logger.info(`payment gRPC server started on port ${port}`)
})

process.once('SIGINT', closeGracefully)
process.once('SIGTERM', closeGracefully)
