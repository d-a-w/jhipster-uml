/**
 * Copyright 2013-2017 the original author or authors from the JHipster project.
 *
 * This file is part of the JHipster project, see https://jhipster.github.io/
 * for more information.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const JHipsterCore = require('jhipster-core');
const chalk = require('chalk');
const _ = require('lodash');
const isNoSQL = require('./types/types_helper').isNoSQL;
const isMongoDB = require('./types/types_helper').isMongoDB;
const checkValidityOfAssociation = require('./helpers/association_helper').checkValidityOfAssociation;
const cardinalities = require('./cardinalities');
const formatComment = require('./helpers/comment_helper').formatComment;
const readJSONFiles = require('./utils/jhipster_utils').readJSONFiles;
const BuildException = require('./exceptions/exception_factory').BuildException;
const exceptions = require('./exceptions/exception_factory').exceptions;
const winston = require('winston');

const ObjectUtils = JHipsterCore.ObjectUtils;

const USER = 'user';

let entitiesToSuppress;
let listDTO;
let listPagination;
let listService;
let microserviceNames;
let entities;
let onDiskEntities;
let searchEngines;
let databaseTypes;
let parsedData;
let noUserManagement;
let angularSuffixes;
let fluentMethods;
let jpaMetamodelFiltering;

module.exports = {
  /**
   * Keys of options:
   *   - listDTO,
   *   - listPagination,
   *   - listService,
   *   - microserviceNames,
   *   - searchEngines,
   *   - listOfNoClient,
   *   - listOfNoServer,
   *   - angularSuffixes,
   *   - fluentMethods,
   *   - jpaMetamodelFiltering
   */
  createEntities
};

function createEntities(parsedData, databaseTypes, options) {
  const merged = ObjectUtils.merge(defaults(), options);
  if (!parsedData || !databaseTypes) {
    throw new BuildException(
      exceptions.NullPointer,
      'The parsed data and database types are mandatory.');
  }
  init(merged, parsedData, databaseTypes);
  checkNoSQLModeling();
  onDiskEntities = readJSONFiles(parsedData.classNames);
  initializeEntities();
  fillEntities();
  return entities;
}

function init(args, passedParsedData, passedDatabaseTypes) {
  entitiesToSuppress = [];
  listDTO = args.listDTO;
  listPagination = args.listPagination;
  listService = args.listService;
  microserviceNames = args.microserviceNames;
  searchEngines = args.searchEngines;
  databaseTypes = passedDatabaseTypes;
  parsedData = passedParsedData;
  entities = {};
  onDiskEntities = {};
  noUserManagement = args.noUserManagement;
  angularSuffixes = args.angularSuffixes;
  fluentMethods = args.fluentMethods;
  jpaMetamodelFiltering = args.jpaMetamodelFiltering;
}

function checkNoSQLModeling() {
  if (isNoSQL(databaseTypes) && !isMongoDB(databaseTypes) && Object.keys(parsedData.associations).length !== 0) {
    throw new BuildException(
      exceptions.NoSQLModeling, 'NoSQL entities don\'t have relationships.');
  }
}

function initializeEntities() {
  let index = 0;
  Object.keys(parsedData.classes).forEach((classId) => {
    let initializedEntity = {
      fluentMethods: false,
      jpaMetamodelFiltering: false,
      relationships: [],
      fields: [],
      changelogDate: getChangelogDate(classId, index),
      dto: parsedData.getClass(classId).dto,
      pagination: parsedData.getClass(classId).pagination,
      service: parsedData.getClass(classId).service,
      microserviceName: parsedData.getClass(classId).microserviceName,
      searchEngine: parsedData.getClass(classId).searchEngine,
      javadoc: formatComment(parsedData.getClass(classId).comment),
      entityTableName: _.snakeCase(parsedData.getClass(classId).tableName)
    };

    initializedEntity =
      setOptions(initializedEntity, parsedData.getClass(classId).name);

    entities[classId] = initializedEntity;
    index++;
  });
}

function getChangelogDate(classId, increment) {
  if (onDiskEntities[parsedData.getClass(classId).name]) {
    return onDiskEntities[parsedData.getClass(classId).name].changelogDate;
  }
  return JHipsterCore.dateFormatForLiquibase({ increment });
}

function setOptions(entity, entityName) {
  if (entityName in listDTO) {
    entity.dto = listDTO[entityName];
  }
  if (entityName in listPagination) {
    entity.pagination = listPagination[entityName];
  }
  if (entityName in listService) {
    entity.service = listService[entityName];
  }
  if (entityName in microserviceNames) {
    entity.microserviceName = microserviceNames[entityName];
  }
  if (entityName in searchEngines) {
    entity.searchEngine = searchEngines[entityName];
  }
  if (fluentMethods.indexOf(entityName) !== -1) {
    entity.fluentMethods = true;
  }
  if (entityName in angularSuffixes) {
    entity.angularJSSuffix = angularSuffixes[entityName];
  }
  if (jpaMetamodelFiltering.indexOf(entityName) !== -1) {
    entity.jpaMetamodelFiltering = true;
  }
  return entity;
}

function defaults() {
  return {
    listDTO: {},
    listPagination: {},
    listService: {},
    microserviceNames: {},
    searchEngines: {},
    fluentMethods: [],
    angularSuffixes: {},
    jpaMetamodelFiltering: []
  };
}

function fillEntities() {
  Object.keys(parsedData.classes).forEach((classId) => {
    /*
       * If the user adds a 'User' entity we consider it as the already
       * created JHipster User entity and none of its fields and ownerside
       * relationships will be considered.
       */
    if (parsedData.getClass(classId).name.toLowerCase() === USER && !noUserManagement) {
      winston.warn(
        chalk.yellow(
          'Warning:  An Entity called \'User\' was defined: \'User\' is an' +
          ' entity created by default by JHipster. All relationships toward' +
          ' it will be kept but all attributes and relationships from it' +
          ' will be disregarded.'));
      entitiesToSuppress.push(classId);
    }
    setFieldsOfEntity(classId);
    setRelationshipOfEntity(classId);
  });
  Object.keys(entitiesToSuppress).forEach((entity) => {
    delete entities[entitiesToSuppress[entity]];
  });
}

function setFieldsOfEntity(classId) {
  for (let i = 0; i < parsedData.classes[classId].fields.length; i++) {
    const fieldId = parsedData.classes[classId].fields[i];
    const fieldData = {
      fieldName: _.camelCase(parsedData.getField(fieldId).name)
    };
    const comment = formatComment(parsedData.getField(fieldId).comment);
    if (comment) {
      fieldData.comment = comment;
    }

    if (parsedData.types[parsedData.getField(fieldId).type]) {
      fieldData.fieldType = parsedData.getType(parsedData.getField(fieldId).type).name;
    } else if (parsedData.getEnum(parsedData.getField(fieldId).type)) {
      fieldData.fieldType = parsedData.getEnum(parsedData.getField(fieldId).type).name;
      fieldData.fieldValues = parsedData.getEnum(parsedData.getField(fieldId).type).values.join(',');
    }

    switch (fieldData.fieldType) {
    case 'Blob':
    case 'AnyBlob':
      fieldData.fieldType = 'byte[]';
      fieldData.fieldTypeBlobContent = 'any';
      break;
    case 'ImageBlob':
      fieldData.fieldType = 'byte[]';
      fieldData.fieldTypeBlobContent = 'image';
      break;
    case 'TextBlob':
      fieldData.fieldType = 'byte[]';
      fieldData.fieldTypeBlobContent = 'text';
      break;
    default:
    }

    setValidationsOfField(fieldData, fieldId);
    entities[classId].fields.push(fieldData);
  }
}

function setValidationsOfField(field, fieldId) {
  if (parsedData.getField(fieldId).validations.length === 0) {
    return;
  }
  field.fieldValidateRules = [];
  for (let i = 0; i < parsedData.getField(fieldId).validations.length; i++) {
    const validation = parsedData.getValidation(parsedData.getField(fieldId).validations[i]);
    field.fieldValidateRules.push(validation.name);
    if (validation.name !== 'required') {
      field[`fieldValidateRules${_.capitalize(validation.name)}`] =
        validation.value;
    }
  }
}

function getRelatedAssociations(classId, associations) {
  const relationships = {
    from: [],
    to: []
  };
  Object.keys(associations).forEach((associationId) => {
    const association = associations[associationId];
    if (association.from === classId) {
      relationships.from.push(associationId);
    }
    if (association.to === classId && association.injectedFieldInTo) {
      relationships.to.push(associationId);
    }
  });
  return relationships;
}

/**
 * Parses the string "<relationshipName>(<otherEntityField>)"
 * @param{String} field
 * @return{Object} where 'relationshipName' is the relationship name and
 *                'otherEntityField' is the other entity field name
 */
function extractField(field) {
  const splitField = {
    otherEntityField: 'id', // id by default
    relationshipName: ''
  };
  if (field) {
    const chunks = field.replace('(', '/').replace(')', '').split('/');
    splitField.relationshipName = chunks[0];
    if (chunks.length > 1) {
      splitField.otherEntityField = chunks[1];
    }
  }
  return splitField;
}

function setRelationshipOfEntity(classId) {
  const relatedAssociations = getRelatedAssociations(
    classId,
    parsedData.associations);
  setSourceAssociationsForClass(relatedAssociations, classId);
  setDestinationAssociationsForClass(relatedAssociations, classId);
}

function setSourceAssociationsForClass(relatedAssociations, classId) {
  for (let i = 0; i < relatedAssociations.from.length; i++) {
    let otherSplitField;
    let splitField;
    const association = parsedData.getAssociation(relatedAssociations.from[i]);
    checkValidityOfAssociation(
      association,
      parsedData.getClass(association.from).name,
      parsedData.getClass(association.to).name);
    const relationship = {
      relationshipType: association.type
    };
    if (association.isInjectedFieldInToRequired && association.type === cardinalities.ONE_TO_MANY) {
      winston.warn(
        chalk.yellow(
          `From ${parsedData.getClass(association.from).name} to ${parsedData.getClass(association.to).name}, a One-to-Many exists and the Many side can't be required. Removing the required flag.`));
      association.isInjectedFieldInToRequired = false;
    }
    if (association.isInjectedFieldInFromRequired && association.type === cardinalities.MANY_TO_ONE) {
      winston.warn(
        chalk.yellow(
          `From ${parsedData.getClass(association.from).name} to ${parsedData.getClass(association.to).name}, a Many-to-One exists and the Many side can't be required. Removing the required flag.`));
      association.isInjectedFieldInFromRequired = false;
    }
    if ((association.isInjectedFieldInToRequired || association.isInjectedFieldInFromRequired) && association.type === cardinalities.MANY_TO_MANY) {
      winston.warn(
        chalk.yellow(
          `From ${parsedData.getClass(association.from).name} to ${parsedData.getClass(association.to).name}, a Many-to-Many exists and none of its sides can be required. Removing the required flag.`));
      association.isInjectedFieldInToRequired = false;
      association.isInjectedFieldInFromRequired = false;
    }
    if (association.isInjectedFieldInFromRequired) {
      relationship.relationshipValidateRules = 'required';
    }
    if (association.type === cardinalities.ONE_TO_ONE) {
      splitField = extractField(association.injectedFieldInFrom);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.to).name));
      relationship.otherEntityField = _.lowerFirst(splitField.otherEntityField);
      relationship.ownerSide = true;
      relationship.otherEntityRelationshipName = _.lowerFirst(association.injectedFieldInTo || parsedData.getClass(association.from).name);
    } else if (association.type === cardinalities.ONE_TO_MANY) {
      splitField = extractField(association.injectedFieldInFrom);
      otherSplitField = extractField(association.injectedFieldInTo);
      relationship.relationshipName = _.lowerFirst(_.camelCase(splitField.relationshipName || parsedData.getClass(association.to).name));
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.to).name));
      relationship.otherEntityRelationshipName = _.lowerFirst(otherSplitField.relationshipName);
      if (!association.injectedFieldInTo) {
        relationship.otherEntityRelationshipName = _.lowerFirst(parsedData.getClass(association.from).name);
        otherSplitField = extractField(association.injectedFieldInTo);
        const otherSideRelationship = {
          relationshipName: _.camelCase(_.lowerFirst(parsedData.getClass(association.from).name)),
          otherEntityName: _.lowerFirst(_.camelCase(parsedData.getClass(association.from).name)),
          relationshipType: cardinalities.MANY_TO_ONE,
          otherEntityField: _.lowerFirst(otherSplitField.otherEntityField)
        };
        association.type = cardinalities.MANY_TO_ONE;
        entities[association.to].relationships.push(otherSideRelationship);
      }
    } else if (association.type === cardinalities.MANY_TO_ONE && association.injectedFieldInFrom) {
      splitField = extractField(association.injectedFieldInFrom);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.to).name));
      relationship.otherEntityField = _.lowerFirst(splitField.otherEntityField);
    } else if (association.type === cardinalities.MANY_TO_MANY) {
      splitField = extractField(association.injectedFieldInFrom);
      relationship.otherEntityRelationshipName = _.lowerFirst(extractField(association.injectedFieldInTo).relationshipName);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.to).name));
      relationship.otherEntityField = _.lowerFirst(splitField.otherEntityField);
      relationship.ownerSide = true;
    }
    entities[classId].relationships.push(relationship);
  }
}

function setDestinationAssociationsForClass(relatedAssociations, classId) {
  for (let i = 0; i < relatedAssociations.to.length; i++) {
    let splitField;
    let otherSplitField;
    const association = parsedData.getAssociation(relatedAssociations.to[i]);
    const relationship = {
      relationshipType: (association.type === cardinalities.ONE_TO_MANY ? cardinalities.MANY_TO_ONE : association.type)
    };
    if (association.isInjectedFieldInToRequired) {
      relationship.relationshipValidateRules = 'required';
    }
    if (association.type === cardinalities.ONE_TO_ONE) {
      splitField = extractField(association.injectedFieldInTo);
      otherSplitField = extractField(association.injectedFieldInFrom);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.from).name));
      relationship.ownerSide = false;
      relationship.otherEntityRelationshipName = _.lowerFirst(otherSplitField.relationshipName);
    } else if (association.type === cardinalities.ONE_TO_MANY) {
      association.injectedFieldInTo = association.injectedFieldInTo || _.lowerFirst(association.from);
      splitField = extractField(association.injectedFieldInTo);
      relationship.relationshipName = _.lowerFirst(_.camelCase(splitField.relationshipName || parsedData.getClass(association.from).name));
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.from).name));
      relationship.otherEntityField = _.lowerFirst(splitField.otherEntityField);
    } else if (association.type === cardinalities.MANY_TO_ONE && association.injectedFieldInTo) {
      splitField = extractField(association.injectedFieldInTo);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.from).name));
      relationship.otherEntityField = _.lowerFirst(splitField.otherEntityField);
    } else if (association.type === cardinalities.MANY_TO_MANY) {
      splitField = extractField(association.injectedFieldInTo);
      relationship.relationshipName = _.camelCase(splitField.relationshipName);
      relationship.otherEntityName = _.lowerFirst(_.camelCase(parsedData.getClass(association.from).name));
      relationship.ownerSide = false;
      relationship.otherEntityRelationshipName = _.lowerFirst(extractField(association.injectedFieldInFrom).relationshipName);
    }
    entities[classId].relationships.push(relationship);
  }
}
