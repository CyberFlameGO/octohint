import * as ts from 'typescript'
import { MultiFileService } from './base'
import * as path from 'path'
// import TS_LIB from '../../ts-lib'
import stdLibs from './node-libs'
import { without, uniq } from 'lodash'
import { MessageFromContentScript } from '../../types'

function getFullLibName(name: string) {
  return `/node_modules/@types/${name}/index.d.ts`
}

interface Files {
  [fileName: string]: {
    version: number
    content: string
    // dependencies: string[]
  }
}

// FIXME: Very slow when click type `string`
// TODO: Go to definition for third party libs
export default class TSService extends MultiFileService {
  static defaultLib = ts.ScriptSnapshot.fromString(window.TS_LIB)
  static defaultLibName = '//lib.d.ts'

  private service: ts.LanguageService
  get getSourceFile() {
    return this.service.getProgram().getSourceFile
  }
  private files: Files = {
    [getFullLibName('node')]: {
      content: require('raw-loader!@types/node/index.d.ts'),
      version: 0,
      // dependencies: [],
    },
  }
  // private libs: Files = {}

  constructor(message: MessageFromContentScript) {
    super()
    this.createService(message)
  }

  // Use regex to get third party lib names
  getLibNamesFromCode(code: string) {
    const regs = [/[import|export].*?from\s*?['"](.*?)['"]/g, /require\(['"](.*?)['"]\)/g] // TODO: Exclude comment
    let result: string[] = []
    for (const reg of regs) {
      const matches = code.match(reg) || []
      // console.log(reg, matches)
      // Exclude node standard libs
      const libs = without(
        matches
          .map(str => str.replace(reg, '$1'))
          .map(str => str.split('/')[0]) // Extract correct lib of `lodash/throttle`
          .filter(item => item[0] !== '.'), // Exclude relative path, like `./xxx`
        ...stdLibs,
      )
      result = [...result, ...libs]
    }
    return uniq(result)
  }

  // Try to get type definition
  async fetchLibCode(name: string) {
    const fullname = getFullLibName(name)
    if (this.files[fullname]) {
      return
    }

    const prefix = 'https://unpkg.com'
    try {
      // Find typings file path
      const r0 = await fetch(path.join(prefix, name, 'package.json'))
      if (r0.ok) {
        const { typings } = await r0.json()
        if (typings) {
          const r1 = await fetch(path.join(prefix, name, typings))
          if (r1.ok) {
            return r1.text()
          }
        }
      }

      // If typings not specified, try DefinitelyTyped
      const r2 = await fetch(path.join(prefix, '@types', name, 'index.d.ts'))
      if (r2.ok) {
        return r2.text()
      }
    } catch (err) {
      console.error(err)
    }
  }

  private updateContent(name: string, code: string) {
    if (this.files[name]) {
      // TODO: Make version work
      // Fetch code every time is too expensive

      // if (this.files[fileName].content !== code) {
      //   this.files[fileName].version += 1
      //   this.files[fileName].content = code
      // }
      return
    } else {
      this.files[name] = {
        version: 0,
        content: code,
        // dependencies: [],
      }
    }
    console.log('Updated, current files:', this.files)
  }

  // Notice that this method is asynchronous
  async createService(message: MessageFromContentScript) {
    if (this.files[message.file]) return

    const code = await this.fetchCode(message)
    this.updateContent(message.file, code)

    const libNames = this.getLibNamesFromCode(code)
    console.log('Libs:', libNames)
    const libCodes = await Promise.all(libNames.map(lib => this.fetchLibCode(lib)))
    libNames.forEach((name, i) => {
      const code = libCodes[i]
      if (code) {
        // this.files[fileName].dependencies.push(name)
        this.updateContent(getFullLibName(name), code)
      }
    })

    // https://github.com/Microsoft/TypeScript/wiki/Using-the-Compiler-API#incremental-build-support-using-the-language-services
    const host: ts.LanguageServiceHost = {
      getScriptFileNames: () => {
        const fileNames = Object.keys(this.files)
        // console.log('getScriptFileNames:', fileNames)
        return fileNames
      },
      getScriptVersion: fileName => {
        const version = (this.files[fileName] && this.files[fileName].version.toString()) || '0'
        // console.log('getScriptVersion:', fileName, version)
        return version
      },
      getScriptSnapshot: fileName => {
        let snapshot
        if (fileName === TSService.defaultLibName) {
          snapshot = TSService.defaultLib
        } else if (this.files[fileName]) {
          snapshot = ts.ScriptSnapshot.fromString(this.files[fileName].content)
        }
        // console.log('getScriptSnapshot', fileName)
        return snapshot
      },
      getCurrentDirectory: () => '/',
      getCompilationSettings: () => ({
        allowJs: true,
        diagnostics: true,
        // traceResolution: true,
        allowSyntheticDefaultImports: true,
        // lib: ['lib.es6.d.ts'],
      }),
      getDefaultLibFileName: () => TSService.defaultLibName,
      // getDefaultLibFileName: options => ts.getDefaultLibFileName(options),
      // getNewLine: ts.sys.newLine,
      log: console.log,
      trace: console.log,
      error: console.error,
    }

    // Create the language service files
    this.service = ts.createLanguageService(host, ts.createDocumentRegistry())
  }

  // getPosition(sourceFile: ts.SourceFile, line: number, character: number) {
  //   return sourceFile.getPositionOfLineAndCharacter(line, character)
  // }

  getOccurrences(file: string, line: number, character: number) {
    if (!this.service) return [] // This is necesarry because createService is asynchronous
    const instance = this.getSourceFile(file)

    // After upgrading to typescript@2.5
    // When mouse position is invalid (outside the code area), always break on a debugger expression
    // https://github.com/Microsoft/TypeScript/blob/9e51882d9cb1efdd164e27e98f3de2d5294b8257/src/compiler/scanner.ts#L341
    // Deactivate breakpoint to prevent annoying break, and catch this error
    let position: number
    try {
      position = instance.getPositionOfLineAndCharacter(line, character)
    } catch (err) {
      return []
    }
    return (this.service.getReferencesAtPosition(file, position) || [])
      .filter(({ fileName }) => fileName === file)
      .map(reference => ({
        isWriteAccess: reference.isWriteAccess,
        range: instance.getLineAndCharacterOfPosition(reference.textSpan.start),
        width: reference.textSpan.length,
      }))
  }

  getDefinition(file: string, line: number, character: number) {
    if (!this.service) return
    const instance = this.getSourceFile(file)
    let position: number
    try {
      position = instance.getPositionOfLineAndCharacter(line, character)
    } catch (err) {
      return
    }
    const infos = this.service.getDefinitionAtPosition(file, position)
    if (infos) {
      const infosOfCurrentFile = infos.filter(info => info.fileName === file)
      if (infosOfCurrentFile.length) {
        return instance.getLineAndCharacterOfPosition(infosOfCurrentFile[0].textSpan.start)
      }
    }
  }

  getQuickInfo(file: string, line: number, character: number) {
    if (!this.service) return
    const instance = this.getSourceFile(file)
    let position: number
    try {
      position = instance.getPositionOfLineAndCharacter(line, character)
    } catch (err) {
      // console.error(err)
      return
    }
    const quickInfo = this.service.getQuickInfoAtPosition(file, position)
    if (quickInfo) {
      // TODO: Colorize display parts
      return {
        info: quickInfo.displayParts,
        range: instance.getLineAndCharacterOfPosition(quickInfo.textSpan.start),
        width: quickInfo.textSpan.length,
      }
    }
  }
}
