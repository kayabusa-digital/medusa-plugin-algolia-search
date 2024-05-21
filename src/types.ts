import { SearchTypes } from '@medusajs/types'

export type SearchOptions = {
	paginationOptions: Record<string, unknown>
	filter: string
	additionalOptions: Record<string, unknown>
}

export type IndexSettingsExtended = SearchTypes.IndexSettings & {
	indexSettings: {
		indexName: string // algolia index name. Must be unique value
	}
	filter?: (document: any) => boolean
}

export type IndexTypes = 'products' | string

export type AlgoliaPluginOptions = {
	applicationId: string
	adminApiKey: string
	/**
	 * Index settings
	 */
	settings: {
		[key in IndexTypes]: IndexSettingsExtended[]
	}
}
