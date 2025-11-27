#!/usr/bin/env node

import { makeSearchURL, syncSearchPage, type SearchURLOpts } from './poultry.ts'

const TOKEN_ENV_VAR = 'GH_TOKEN'

type PoultryArgs = {
    outdir: string
    qualifiers: SearchURLOpts['qualifiers']
}

function printHelp(msg?: string): never {
    if (msg) printError(msg)
    console.log('poultry [OPTIONS] --out-dir OUT_DIR')
    console.log()
    console.log('Search options:')
    console.log('    --ext       Files with extension')
    console.log('    --filename  Files with name')
    console.log('    --in        Files with name')
    console.log('    --lang      Search for language')
    console.log("    --org       Within org's repos")
    console.log('    --path      With a path qualifier')
    console.log('    --repo      Within a repo')
    console.log('    --size      On file size using formats >n <n *..n n..*')
    console.log("    --user      Within user's repos")
    process.exit(1)
}

function printError(s: string) {
    console.error(red('error:'), s)
}

function errorExit(s: string): never {
    printError(s)
    process.exit(1)
}

function red(s: string): string {
    return `\u001b[31m${s}\u001b[0m`
}

const args = (function collectArgs(): PoultryArgs {
    const programNames: Array<string> = ['poultry', 'bin.js', 'bin.ts']
    let args = [...process.argv]
    while (true) {
        const shifted = args.shift()
        if (!shifted || programNames.some(name => shifted.endsWith(name))) {
            break
        }
    }
    if (args.some(arg => arg === '-h' || arg === '--help')) {
        printHelp()
    }
    let outdir: string | null = null
    const qualifiers: SearchURLOpts['qualifiers'] = {}
    function addSearchOption(
        field: keyof SearchURLOpts['qualifiers'],
        value: string,
    ) {
        if (Array.isArray(qualifiers[field])) {
            qualifiers[field].push(value)
        } else if (typeof qualifiers[field] === 'string') {
            qualifiers[field] = [qualifiers[field], value]
        } else {
            qualifiers[field] = value
        }
    }
    while (true) {
        const shifted = args.shift()
        if (typeof shifted === 'undefined') {
            break
        }
        switch (shifted) {
            case '--out-dir':
            case '--outdir':
                const maybeOutdir = args.shift()
                if (!maybeOutdir || maybeOutdir.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                outdir = maybeOutdir
                break
            case '--ext':
            case '--extension':
                const maybeExt = args.shift()
                if (!maybeExt || maybeExt.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('extension', maybeExt)
                break
            case '--filename':
                const maybeFilename = args.shift()
                if (!maybeFilename || maybeFilename.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('filename', maybeFilename)
                break
            case '--in':
                const maybeIn = args.shift()
                if (!maybeIn || maybeIn.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                const valid = ['file', 'path', 'file,path', 'path,file']
                if (!valid.includes(maybeIn)) {
                    errorExit(
                        `--in must be one of ${valid.map(v => `--in "${v}"`).join(' ')}`,
                    )
                }
                addSearchOption('in', maybeIn)
                break
            case '--lang':
            case '--language':
                const maybeLang = args.shift()
                if (!maybeLang || maybeLang.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('language', maybeLang)
                break
            case '--org':
                const maybeOrg = args.shift()
                if (!maybeOrg || maybeOrg.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('org', maybeOrg)
                break
            case '--path':
                const maybePath = args.shift()
                if (!maybePath || maybePath.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('path', maybePath)
                break
            case '--repo':
                const maybeRepo = args.shift()
                if (!maybeRepo || maybeRepo.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('repo', maybeRepo)
                break
            case '--user':
                const maybeUser = args.shift()
                if (!maybeUser || maybeUser.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('user', maybeUser)
                break
            case '--size':
                const maybeSize = args.shift()
                if (!maybeSize || maybeSize.startsWith('--')) {
                    printHelp(shifted + ' missing value')
                }
                addSearchOption('size', maybeSize)
                break
            default:
                printHelp(shifted + " isn't an arg")
        }
    }
    if (Object.values(qualifiers).length === 0) {
        printHelp('at least one search option is required')
    }
    if (!outdir) {
        printHelp('--out-dir is required')
    }
    return { outdir, qualifiers }
})()

const ghToken = process.env[TOKEN_ENV_VAR]
if (!ghToken) {
    errorExit(TOKEN_ENV_VAR + ' env var is required')
}

const syncResult = await syncSearchPage({
    ghToken,
    outdir: args.outdir,
    url: makeSearchURL({ qualifiers: args.qualifiers }),
})

if (syncResult.kind === 'error') {
    switch (syncResult.type) {
        case 'rate-limited':
            errorExit(
                'api rate limit exceeded, retry after ' +
                    syncResult.reset?.toLocaleTimeString() || '1 minute',
            )
        case 'unauthorized':
            errorExit('GH_TOKEN is not valid')
        default:
            errorExit('not sure what happened?')
    }
} else if (syncResult.kind === 'success') {
    console.log(
        'synced page',
        syncResult.pages.total - syncResult.pages.remaining,
        'out of',
        syncResult.pages.total,
        'pages',
    )
}
