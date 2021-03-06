#! /usr/bin/env node

console.time('RunTime');

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
    chalk.green('Search for Poketh items and get the signature authorizing address 0xF7Dc813B5c746F777DD29c94b7558ADE7577064e.'))
  .alias('a', ('address'))
  .string('a')
  .describe('a', chalk.green('User address'))
  .option('a', {demand: true, demand: 'address is required'})
  .alias('t', ('threads'))
  .string('t')
  .describe('t', chalk.green('Threads to use for mining'))
  .alias('d', ('diff'))
  .string('d')
  .describe('d', chalk.green('Difficulty Mask of the PKTH contract'))
  .alias('l', ('log'))
  .boolean('l')
  .describe('l', chalk.green('If set, do NOT log output to file'))
  .help('h')
  .alias('h', ('help'))
  .epilog('copyright 2018')
  .argv;

if (cluster.isMaster) {
  const args = {
      address    : argv.address,
      threads    : argv.threads < numCPUs ? argv.input                      : numCPUs,
      diffMask   : argv.diff ? argv.diff                                    : 3,
      log        : argv.log ? false                                         : true,
    logFname   : !argv.log ? './miner-logs/Poketh-Miner-Output-' + Date.now() + '.log' : ''
  }
  if (!VanityEth.isValidHex(args.address)) {
    console.error(args.address + ' is not valid address');
    process.exit(1);
  }
  if (args.log) {
    var fs = require('fs');
    console.log('logging into' + args.logFname);
    var logStream = fs.createWriteStream(args.logFname, { 'flags': 'a' });
  }
  var walletsFound = 0;

  console.clear();
  console.log(chalk.underline(chalk.red("Pok") + chalk.bgBlack.white("ETH")));
  console.log(chalk.blue("Difficulty: ") + chalk.red(args.diffMask));
  console.log("\n");

  const spinner = ora({ text: chalk.green('Walking in the tall grass...'), color : 'yellow', stream : process.stdout }).start();

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
      const item = await fetcher.getPokethItem(message.wallet.address); 
      const itemClass = item === '9000' ? 'Error fetching' : item;
      
      const signature      = signer.signWithKey(message.wallet.privKey, args.address).signature;
      const printWallet    = (chalk.underline("Found a valid wallet!") + 
                              chalk.blue("\nAddress:     " + chalk.yellow(message.wallet.address) +
                                         "\nPrivate Key: " + chalk.yellow("0x" + message.wallet.privKey)));
      const printSignature = (chalk.underline("Signature Information:") + 
                              chalk.blue("\nSignature:      " + chalk.yellow(signature) +
                                         "\nItem Bit Class: " + chalk.yellow(message.bits) +
                                         "\nItem Class:     " + chalk.white(itemClass)));

      spinner.succeed(printWallet);
      spinner.info(printSignature);
      console.log(chalk.white("----------------------------------------------------------------------------------"));

      const logObject = {};
      logObject[item] = [];
      logObject[item].push({"bitClass" : message.bits});
      logObject[item].push(message.wallet);
      logObject[item].push({"signature" : signature});

      if (args.log) logStream.write(JSON.stringify(logObject) + " \n");
      
      spinner.text = chalk.green('Walking in the tall grass');
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
