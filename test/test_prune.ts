import { TestFuncs, Test, Result, TestReport, 
		 runTestsAsync } from '../lib/TestRun.js'
import * as tp from '../toastpoint.js'

import fs from 'fs'

let factory = function( newable: any ): () => any {
	return () => {
		let obj = new newable();
		return obj;
	}
}

type Dict<Type> = { [key: string]: Type };

class A {
	id: number;
	bees: Array<B> = [];
	named_bees: Dict<B> = {};
	reg_obj: Dict<string> = { key: 'value' };

	constructor( id: number ) {
		this.id = id;
	}
}

class B {
	id: number;

	constructor( id: number ) {
		this.id = id;
	}
}

let b2 = new B( 2 );
let b3 = new B( 3 );
let b4 = new B( -1 );
let a1 = new A( 1 );
a1.bees = [b2, b3, b4];
a1.named_bees = { 'twill': b2, 'thread': b3, 'negate': b4 };

let constructors = { 'A': factory( A ), 
				  	 'B': factory( B ) };

function test_prune( tf: TestFuncs ) {
	let list = [a1, b2, b3, b4];

	// no id list passed
	let json = tp.listToJSON( list, constructors );

	let toaster = new tp.Toaster( constructors );
	let regen: Array<any> = tp.fromJSON( json, toaster );

	tf.ASSERT_EQ( regen.length, 4 );
	tf.ASSERT_EQ( regen.map( x => x.constructor.name ), ['A', 'B', 'B', 'B'] );
	tf.ASSERT_EQ( ( regen[0] as A ).bees.map( x => x.id ), [2, 3, -1] );
	tf.ASSERT_EQ( Object.keys( regen[0].named_bees ), ['twill', 'thread', 'negate'] );
	tf.ASSERT_EQ( regen[0].reg_obj.key, 'value' );

	// pass through pruneList, no pruning occurs
	json = tp.listToJSON( list, constructors, undefined, [1, 2, 3] );
	toaster = new tp.Toaster( constructors );
	regen = tp.fromJSON( json, toaster );

	tf.ASSERT_EQ( regen.length, 4 );
	tf.ASSERT_EQ( regen.map( x => x.constructor.name ), ['A', 'B', 'B', 'B'] );
	tf.ASSERT_EQ( ( regen[0] as A ).bees.map( x => x.id ), [2, 3, -1] );
	tf.ASSERT_EQ( Object.keys( regen[0].named_bees ), ['twill', 'thread', 'negate'] );
	tf.ASSERT_EQ( Object.values( regen[0].named_bees ), [regen[1], regen[2], regen[3]] );
	tf.ASSERT_EQ( regen[0].reg_obj.key, 'value' );

	// remove b3
	json = tp.listToJSON( list, constructors, undefined, [1, 2] );
	toaster = new tp.Toaster( constructors );
	regen = tp.fromJSON( json, toaster );

	tf.ASSERT_EQ( regen.length, 3 );
	tf.ASSERT_EQ( regen.map( x => x.constructor.name ), ['A', 'B', 'B',] );
	tf.ASSERT_EQ( ( regen[0] as A ).bees.map( x => x.id ), [2, -1] );
	tf.ASSERT_EQ( Object.keys( regen[0].named_bees ), ['twill', 'thread', 'negate'] );
	tf.ASSERT_EQ( Object.values( regen[0].named_bees ), [regen[1], null, regen[2]] );
	tf.ASSERT_EQ( regen[0].reg_obj.key, 'value' );

	// remove b2, b3
	json = tp.listToJSON( list, constructors, undefined, [1] );
	toaster = new tp.Toaster( constructors );
	regen = tp.fromJSON( json, toaster );
	let a = regen[0];

	tf.ASSERT_EQ( ( a as A ).bees.map( x => x.id ), [-1] );
	tf.ASSERT_EQ( Object.keys( a.named_bees ), ['twill', 'thread', 'negate'] );
	tf.ASSERT_EQ( Object.values( a.named_bees ), [null, null, regen[1]] );
	tf.ASSERT_EQ( a.reg_obj.key, 'value' );

	// remove a1
	json = tp.listToJSON( list, constructors, undefined, [2, 3] );
	toaster = new tp.Toaster( constructors );
	regen = tp.fromJSON( json, toaster );

	tf.ASSERT_EQ( regen.length, 3 );
	tf.ASSERT_EQ( regen.map( x => x.constructor.name ), ['B', 'B', 'B',] );
}

let tests: Array<Test> = [];

tests.push( new Test( 'prune', 
						test_prune,
						[] ) );

let report = new TestReport();
runTestsAsync( tests, true, report ).then( function() {
	report.print();
} );
