import { Logger, MedusaContainer, SearchTypes } from '@medusajs/types'
import {
	AbstractSearchService,
	MedusaError,
	SearchUtils,
} from '@medusajs/utils'
import Algolia, { SearchClient } from 'algoliasearch'
import {
	AlgoliaPluginOptions,
	IndexSettingsExtended,
	IndexTypes,
	SearchOptions,
} from '../types'

class AlgoliaService extends SearchUtils.AbstractSearchService {
	isDefault = false

	protected readonly config_: AlgoliaPluginOptions
	protected readonly logger_: Logger
	protected readonly client_: SearchClient

	static _isSearchService: boolean = true

	private readonly settings: {
		[key in IndexTypes]: {
			[key: string]: {
				indexSettings: Record<string, unknown>
				filter: (document: any) => boolean
				transformer: (document: any) => any
			}
		}
	}

	private getFunctionsForIndex(
		indexName: string,
		indexesSettings: IndexSettingsExtended[]
	): {
		filter: (document: any) => boolean
		transformer: (document: any) => any
	} {
		const currentIndex = indexesSettings.find(
			(index) => index.indexSettings.indexName == indexName
		)
		if (currentIndex == null)
			throw new MedusaError(
				MedusaError.Types.NOT_FOUND,
				`Index settings for index '${indexName}' not found`
			)

		let filter =
			typeof currentIndex.filter === 'function'
				? currentIndex.filter
				: null
		let transformer =
			typeof currentIndex.transformer === 'function'
				? currentIndex.transformer
				: null

		if (filter == null) filter = () => true

		if (transformer == null)
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				`Transformer for index ${indexName} not found`
			)

		return {
			filter,
			transformer,
		}
	}

	constructor(
		container: MedusaContainer & {
			logger: Logger
		},
		options: AlgoliaPluginOptions
	) {
		super(container, options)

		this.config_ = options
		this.logger_ = container['logger']

		const { applicationId, adminApiKey } = options

		if (!applicationId) {
			throw new Error('Please provide a valid Application ID')
		}

		if (!adminApiKey) {
			throw new Error('Please provide a valid Admin Api Key')
		}

		if (this.config_?.settings == null)
			throw new MedusaError(
				MedusaError.Types.INVALID_DATA,
				'Settings for any index was not settled'
			)

		const settings: typeof this.settings = {}

		Object.keys(this.config_.settings).forEach((indexType) => {
			settings[indexType] = {}
			this.config_.settings[indexType].forEach((settingsPerIndex) => {
				const { filter, transformer } = this.getFunctionsForIndex(
					settingsPerIndex.indexSettings.indexName,
					this.config_.settings[indexType]
				)

				const indexSettings: Partial<
					IndexSettingsExtended['indexSettings']
				> = { ...settingsPerIndex.indexSettings }
				delete indexSettings.indexName

				settings[indexType][settingsPerIndex.indexSettings.indexName] =
					{
						indexSettings,
						filter,
						transformer,
					}
			})
		})

		this.settings = settings

		console.log(this.settings)

		this.client_ = Algolia(applicationId, adminApiKey)
	}

	static isSearchService(obj: any): obj is AbstractSearchService {
		return obj.prototype._isSearchService
	}

	private getOrThrowSettingsFor(indexType: IndexTypes) {
		if (this.settings[indexType] == null)
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				`Settings for ${indexType} index not provided`
			)
		return this.settings[indexType]
	}

	/**
	 * Add two numbers.
	 * @param {string} indexType - The name of the index
	 * @param {*} options - not required just to match the schema we are used it
	 * @return {*}
	 */
	createIndex(indexType: IndexTypes, options: Record<string, unknown> = {}) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		for (const indexName of Object.keys(indexesSettings))
			this.client_.initIndex(indexName)
	}

	/**
	 * Used to get an index
	 * @param {string} indexType  - the index name.
	 * @return {Promise<{object}>} - returns response from first declared in settings search engine provider
	 */
	async getIndex(indexType: IndexTypes) {
		let hits: Record<string, unknown>[] = []

		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const indexesNames = Object.keys(indexesSettings)

		if (indexesNames.length == 0)
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				`No one index settings was provided`
			)

		return await this.client_
			.initIndex(indexesNames[0])
			.browseObjects({
				query: indexesNames[0],
				batch: (batch) => {
					hits = hits.concat(batch)
				},
			})
			.then(() => hits)
	}

	/**
	 *
	 * @param {string} indexType - the index type
	 * @param {Array} documents - products list array
	 * @param {*} type
	 * @return {Promise<{object}[]>} - returns response from all search engine providers
	 */
	async addDocuments(
		indexType: IndexTypes,
		documents: Array<any>,
		type: string
	) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const promises: Promise<any>[] = []
		for (const indexName of Object.keys(indexesSettings))
			promises.push(
				(async (): Promise<any> => {
					const filteredDocumentsForDeletion = documents.filter(
						(document) =>
							!indexesSettings[indexName].filter(document)
					)

					const transformedDocuments = this.getTransformedDocuments(
						documents,
						indexesSettings[indexName].filter,
						indexesSettings[indexName].transformer
					)

					const index = this.client_.initIndex(indexName)
					return await Promise.all([
						index.saveObjects(transformedDocuments),
						index.deleteObjects(
							filteredDocumentsForDeletion.map(
								(document) => document.id
							)
						),
					])
				})()
			)
		return await Promise.all(promises)
	}

	/**
	 * Used to replace documents
	 * @param {string} indexType  - the index type.
	 * @param {Object} documents  - array of document objects that will replace existing documents
	 * @param {Array.<Object>} type  - type of documents to be replaced (e.g: products, regions, orders, etc)
	 * @return {Promise<{object}[]>} - returns response from all search engine providers
	 */
	async replaceDocuments(
		indexType: IndexTypes,
		documents: any,
		type: string
	) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const promises: Promise<any>[] = []
		for (const indexName of Object.keys(indexesSettings))
			promises.push(
				(async (): Promise<any> => {
					const transformedDocuments = this.getTransformedDocuments(
						documents,
						indexesSettings[indexName].filter,
						indexesSettings[indexName].transformer
					)

					return await this.client_
						.initIndex(indexName)
						.replaceAllObjects(transformedDocuments)
				})()
			)
		return await Promise.all(promises)
	}

	/**
	 * Used to delete document
	 * @param {string} indexType  - the index type
	 * @param {string} documentId  - the id of the document
	 * @return {Promise<{object}[]>} - returns response from all search engine provider
	 */
	async deleteDocument(indexType: string, documentId: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const promises = []
		for (const indexName of Object.keys(indexesSettings))
			promises.push(
				this.client_.initIndex(indexName).deleteObject(documentId)
			)

		return await Promise.all(promises)
	}

	/**
	 * Used to delete all documents
	 * @param {string} indexType  - the index type
	 * @return {Promise<{object}>[]} - returns response from all search engine providers
	 */
	async deleteAllDocuments(indexType: IndexTypes) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const promises = []
		for (const indexName of Object.keys(indexesSettings))
			promises.push(this.client_.initIndex(indexName).delete())

		return await Promise.all(promises)
	}

	/**
	 * Used to search for a document in an index
	 * @param {string} indexType - the index type
	 * @param {string} query  - the search query
	 * @param {*} options
	 * - any options passed to the request object other than the query and indexName
	 * - additionalOptions contain any provider specific options
	 * @return {*} - returns response from first declared index in settings
	 */
	async search(
		indexType: IndexTypes,
		query: string,
		options: SearchOptions & Record<string, unknown>
	) {
		const { paginationOptions, additionalOptions } = options
		const indexesSettings = this.getOrThrowSettingsFor(indexType)
		const indexesNames = Object.keys(indexesSettings)

		if (indexesNames.length == 0)
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				`No one index settings was provided`
			)

		// fit our pagination options to what Algolia expects
		if ('limit' in paginationOptions && paginationOptions.limit != null) {
			paginationOptions['length'] = paginationOptions.limit
			delete paginationOptions.limit
		}

		return await this.client_.initIndex(indexesNames[0]).search(query, {
			...paginationOptions,
			...additionalOptions,
		})
	}

	/**
	 * Used to update the settings of an index
	 * @param  {string} indexType - the index type
	 * @return {Promise<{object}>} - returns response from all search engine providers which was updated
	 */
	async updateSettings(indexType: IndexTypes) {
		const indexesSettings = this.getOrThrowSettingsFor(indexType)

		const promises = []

		for (const indexName of Object.keys(indexesSettings))
			promises.push(
				(async () => {
					await this.client_
						.initIndex(indexName)
						.setSettings(
							indexesSettings[indexName].indexSettings ?? {}
						)
				})()
			)

		return await Promise.all(promises)
	}

	getTransformedDocuments(
		documents: any[],
		filter: (document: any) => Boolean,
		transformer: (document: any) => any
	) {
		return documents.filter(filter).map(transformer)
	}
}

export default AlgoliaService
