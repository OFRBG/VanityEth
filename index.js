#! /usr/bin/env node

console.time('RunTime');

var fs = require('fs');
var VanityEth = require('./libs/VanityEth');
var signer    = require('./libs/signer');
var fetcher   = require('./libs/dataFetch');
const ora     = require('ora');
var cluster   = require('cluster')
var numCPUs   = require('os').cpus().length
var chalk     = require('chalk');
var argv      = require('yargs')
  .usage('Usage: $0 <command> [options]')
  .example(chalk.yellow('$0 -a 0xF7Dc813B5c746F777DD29c94b7558ADE7577064e'),
    chalk.green('Mine for CehhGold and get a signature authorizing address 0xF7Dc813B5c746F777DD29c94b7558ADE7577064e.'))
  .alias('a', ('address'))
  .string('a')
  .describe('a', chalk.green('User address'))
  .option('a', {demand: true, demand: 'address is required'})
  .alias('t', ('threads'))
  .string('t')
  .describe('t', chalk.green('Threads to use for mining'))
  .alias('l', ('log'))
  .boolean('l')
  .describe('l', chalk.green('Directory to output log files'))
  .help('h')
  .alias('h', ('help'))
  .epilog('copyright 2018')
  .argv;

if (cluster.isMaster) {
  const args = {
    address    : argv.address,
    threads    : argv.threads < numCPUs ? argv.threads : numCPUs,
    log        : !argv.log ? require('os').homedir() : argv.log,
    logFname   : 'cehhgold-miner-' + Date.now() + '.log'
  }
  if (!VanityEth.isValidHex(args.address)) {
    console.error(args.address + ' is not valid address');
    process.exit(1);
  }
  
  const dir = args.log + '/CehhGold/';
  if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
  }

  var logStream = fs.createWriteStream(dir + args.logFname, { 'flags': 'a' });

  var walletsFound = 0;

  console.clear();
  console.log(chalk.underline(chalk.bgBlack.white("CEHH+ Miner")) + chalk.green('\n -> Logging to ' + dir + '\n'));

  const spinner = ora({ text: chalk.green('Running miner...'), color : 'yellow', stream : process.stdout }).start();

  for (var i = 0; i < args.threads; i++) {
    const worker_env = {
      diffMask : args.diffMask
    }
    proc = cluster.fork(worker_env);

    proc.on('message', function(message) {
      printFind(message, spinner, args);
    });
  }

} else {
  const worker_env = process.env;
  while (true) {
    process.send(VanityEth.getVanityWallet(worker_env.diffMask))
  }
}

async function printFind(message, spinner, args) {
  const reward         = await fetcher.getReward(message.wallet.address) / Math.pow(10,18);

  const signature      = signer.signWithKey(message.wallet.privKey, args.address).signature;
  const printWallet    = (chalk.underline("Found a valid wallet!") + 
    chalk.blue("\nAddress:     " + chalk.yellow(message.wallet.address) +
      "\nPrivate Key: " + chalk.yellow("0x" + message.wallet.privKey)));
  const printSignature = (chalk.underline("Signature Information:") + 
    chalk.blue("\nSignature:        " + chalk.yellow(signature) +
      "\nReward Bit Class: " + chalk.yellow(message.bits) +
      "\nReward:           " + chalk.white(reward) + " CehhGold"));

  spinner.succeed(printWallet);
  spinner.info(printSignature);
  console.log(chalk.white("----------------------------------------------------------------------------------"));

  const logObject = {};
  logObject[message.bits] = [message.wallet,signature];

  if (args.log) logStream.write(JSON.stringify(logObject) + " \n");

  spinner.text = chalk.green('Running miner...');
  spinner.start();
}

process.stdin.resume();
var cleanup = function(options, err) {
  if (err) console.log(err.stack);
  for (var id in cluster.workers) cluster.workers[id].process.kill();
  console.timeEnd('RunTime')
  process.exit();

}
process.on('exit', cleanup.bind(null, {}));
process.on('SIGINT', cleanup.bind(null, {}));
process.on('uncaughtException', cleanup.bind(null, {}));
