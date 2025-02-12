const fs = require('fs')
const path = require('path')
const chalk = require('chalk')
const { createSitemap } = require('sitemap')

const log = (msg, color = 'blue', label = 'SITEMAP') =>
  console.log(`\n${chalk.reset.inverse.bold[color](` ${label} `)} ${msg}`)

function stripLocalePrefix (path, localePathPrefixes) {
  const matchingPrefix = localePathPrefixes.filter(prefix => path.startsWith(prefix)).shift()
  return { normalizedPath: path.replace(matchingPrefix, '/'), localePrefix: matchingPrefix }
}

module.exports = (options, context) => {
  const {
    urls = [],
    hostname,
    cacheTime = 600,
    xslUrl,
    xmlNs,
    outFile = 'sitemap.xml',
    changefreq = 'daily',
    ...others
  } = options

  return {
    generated () {
      if (!hostname) {
        return log(
          `Not generating sitemap because required 'hostname' option doesn't exist`,
          'red'
        )
      }

      log('Generating sitemap...')

      const { pages, locales } = context.getSiteData
        ? context.getSiteData()
        : context

      // Sort the locale keys in reverse order so that longer locales, such as '/en/', match before the default '/'
      const localeKeys = (locales && Object.keys(locales).sort().reverse()) || []
      const localesByNormalizedPagePath = pages.reduce((map, page) => {
        const { normalizedPath, localePrefix } = stripLocalePrefix(page.path, localeKeys)
        const prefixesByPath = map.get(normalizedPath) || []
        prefixesByPath.push(localePrefix)
        return map.set(normalizedPath, prefixesByPath)
      }, new Map())

      const pagesMap = new Map()

      pages.forEach(page => {
        const lastmodISO = page.lastUpdated
          ? new Date(page.lastUpdated).toISOString()
          : undefined
        const { normalizedPath } = stripLocalePrefix(page.path, localeKeys)
        const relatedLocales = localesByNormalizedPagePath.get(normalizedPath)
        let links = []
        if (relatedLocales.length > 1) {
          links = relatedLocales.map(localePrefix => {
            return {
              lang: locales[localePrefix].lang,
              url: normalizedPath.replace('/', localePrefix)
            }
          })
        }
        pagesMap.set(page.path, { changefreq, lastmodISO, links, ...others })
      })

      const sitemap = createSitemap({
        urls,
        hostname,
        cacheTime: cacheTime * 1000,
        xmlNs,
        xslUrl
      })

      pagesMap.forEach((page, url) => {
        sitemap.add({ url, ...page })
      })

      urls.forEach(item => {
        const page = pagesMap.get(item.url)
        if (page) {
          sitemap.del(item.url)
          sitemap.add({ ...page, ...item })
        } else {
          sitemap.add(item)
        }
      })

      log(`found ${sitemap.urls.length} locations`)
      const sitemapXML = path.resolve(context.outDir || options.dest, outFile)

      fs.writeFileSync(sitemapXML, sitemap.toString())
      log(`${sitemap.urls.length} locations have been written.`)
    }
  }
}
