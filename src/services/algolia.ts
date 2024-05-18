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

	constructor(
		container: MedusaContainer & { logger: Logger },
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
				const filter =
					settingsPerIndex.filter ??
					settingsPerIndex.copyFilterFrom != null
						? this.config_.settings[indexType].find(
								(index) =>
									index.indexSettings.indexName ==
									settingsPerIndex.copyFilterFrom
						  )?.filter ?? (() => true)
						: () => true

				const transformer =
					settingsPerIndex.transformer ??
					settingsPerIndex.copyTransformerFrom != null
						? this.config_.settings[indexType].find(
								(index) =>
									index.indexSettings.indexName ==
									settingsPerIndex.copyTransformerFrom
						  )?.transformer
						: null

				if (transformer == null)
					throw new MedusaError(
						MedusaError.Types.INVALID_DATA,
						`Transformer for index ${settingsPerIndex.indexSettings.indexName} not found`
					)

				const indexSettings: Partial<
					IndexSettingsExtended['indexSettings']
				> = settingsPerIndex.indexSettings
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

		this.client_ = Algolia(applicationId, adminApiKey)
	}

	static isSearchService(obj: any): obj is AbstractSearchService {
		return obj.prototype._isSearchService
	}

	private getOrThrowSettingsFor(indexName: IndexTypes) {
		if (this.settings[indexName] == null)
			throw new MedusaError(
				MedusaError.Types.UNEXPECTED_STATE,
				`Settings for ${indexName} index not provided`
			)
		return this.settings[indexName]
	}

	/**
	 * Add two numbers.
	 * @param {string} indexName - The name of the index
	 * @param {*} options - not required just to match the schema we are used it
	 * @return {*}
	 */
	createIndex(indexName: IndexTypes, options: Record<string, unknown> = {}) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

		for (const indexName of Object.keys(indexesSettings))
			this.client_.initIndex(indexName)
	}

	/**
	 * Used to get an index
	 * @param {string} indexName  - the index name.
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async getIndex(indexName: string) {
		let hits: Record<string, unknown>[] = []

		const indexesSettings = this.getOrThrowSettingsFor(indexName)

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
	 * @param {string} indexName
	 * @param {Array} documents - products list array
	 * @param {*} type
	 * @return {*}
	 */
	async addDocuments(indexName: string, documents: any, type: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

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
						.saveObjects(transformedDocuments)
				})()
			)
		await Promise.all(promises)
	}

	/**
	 * Used to replace documents
	 * @param {string} indexName  - the index name.
	 * @param {Object} documents  - array of document objects that will replace existing documents
	 * @param {Array.<Object>} type  - type of documents to be replaced (e.g: products, regions, orders, etc)
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async replaceDocuments(indexName: string, documents: any, type: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

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
		const results = await Promise.all(promises)
		return results?.[0] ?? null
	}

	/**
	 * Used to delete document
	 * @param {string} indexName  - the index name
	 * @param {string} documentId  - the id of the document
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async deleteDocument(indexName: string, documentId: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

		for (const indexName of Object.keys(indexesSettings))
			await this.client_.initIndex(indexName).deleteObject(documentId)
	}

	/**
	 * Used to delete all documents
	 * @param {string} indexName  - the index name
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async deleteAllDocuments(indexName: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

		for (const indexName of Object.keys(indexesSettings))
			await this.client_.initIndex(indexName).delete()
	}

	/**
	 * Used to search for a document in an index
	 * @param {string} indexName - the index name
	 * @param {string} query  - the search query
	 * @param {*} options
	 * - any options passed to the request object other than the query and indexName
	 * - additionalOptions contain any provider specific options
	 * @return {*} - returns response from search engine provider
	 */
	async search(
		indexName: string,
		query: string,
		options: SearchOptions & Record<string, unknown>
	) {
		const { paginationOptions, additionalOptions } = options
		const indexesSettings = this.getOrThrowSettingsFor(indexName)
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
	 * @param  {string} indexName - the index name
	 * @return {Promise<{object}>} - returns response from search engine provider
	 */
	async updateSettings(indexName: string) {
		const indexesSettings = this.getOrThrowSettingsFor(indexName)

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
