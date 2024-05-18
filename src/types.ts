import { SearchTypes } from '@medusajs/types'

export type SearchOptions = {
	paginationOptions: Record<string, unknown>
	filter: string
	additionalOptions: Record<string, unknown>
}

export type IndexSettingsExtended = SearchTypes.IndexSettings & {
	indexSettings: {
		indexName: string // algolia index name in case you are using not `products` name for index, this property are value for copy(Transformer|Filter)From properties, if you are using `products` naming and want to copy methods from this settings, name it `products`. Must be unique value
	}
	copyTransformerFrom?: string // indexName of existing IndexSettingsExtended array, transformer of which will be used, otherwise itself declared transformer be used
	copyFilterFrom?: string // indexName of existing IndexSettingsExtended array, filter of which will be used, otherwise itself declared filter be used
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
